import Stripe from "stripe";
import paypal from "@paypal/checkout-server-sdk";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import paypalClient from "../config/paypal.js";
import crypto from 'crypto';
import sendEmail from '../utils/sendEmail.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Helper: envoie l'email de confirmation de commande ──
const sendOrderConfirmationEmail = async (toEmail, order) => {
  await sendEmail({
    to:      toEmail,
    subject: "Confirmation de votre commande — GOFFA 🧺",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #166534;">✅ Commande confirmée !</h2>
          <p>Merci pour votre commande. Voici le récapitulatif :</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>N° de commande :</strong> #${order.id.slice(0, 8).toUpperCase()}</p>
            <p><strong>Livraison à :</strong> ${order.shipping_address}, ${order.shipping_city}</p>
            <p><strong>Paiement :</strong> ${order.payment_method === 'cod' ? 'Paiement à la livraison' : 'Carte bancaire'}</p>
            <p style="font-size: 20px; color: #166534;"><strong>Total : ${order.total_price} DT</strong></p>
          </div>
          <p style="color: #666; font-size: 14px;">
            Vous recevrez une notification quand votre commande sera expédiée.
          </p>
        </div>
      </div>
    `,
  });
};

// ═══════════════════════════════════════════════════════════
// CREATE ORDER
// POST /api/orders
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const createOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    items, payment_method, shipping_address,
    shipping_city, shipping_country, promo_code, notes,
  } = req.body;

  if (!items || items.length === 0)
    return next(new ErrorHandler("Please provide at least one item.", 400));
  if (!payment_method)
    return next(new ErrorHandler("Please provide a payment method.", 400));
  if (!shipping_address || !shipping_city)
    return next(new ErrorHandler("Please provide shipping address and city.", 400));

  let totalPrice = 0;
  let orderItems = [];

  for (const item of items) {
    const { variant_id, quantity } = item;
    if (!variant_id || !quantity || quantity < 1)
      return next(new ErrorHandler("Each item must have a variant_id and quantity.", 400));

    const variantResult = await database.query(
      `SELECT pv.*, p.name AS product_name,
         COALESCE(json_agg(json_build_object('attribute_type', at.name, 'attribute_value', av.value)) FILTER (WHERE at.id IS NOT NULL), '[]') AS attributes
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN attribute_values av ON av.id = va.attribute_value_id
       LEFT JOIN attribute_types at ON at.id = av.attribute_type_id
       WHERE pv.id = $1 GROUP BY pv.id, p.name`,
      [variant_id]
    );

    if (variantResult.rows.length === 0)
      return next(new ErrorHandler(`Variant ${variant_id} not found.`, 404));

    const variant = variantResult.rows[0];
    if (variant.stock < quantity)
      return next(new ErrorHandler(`Not enough stock for ${variant.product_name}. Available: ${variant.stock}`, 400));

    totalPrice += variant.price * quantity;
    orderItems.push({
      variant_id, quantity,
      price_at_order:  variant.price,
      product_name:    variant.product_name,
      variant_details: variant.attributes,
    });
  }

  let discountAmount = 0;
  if (promo_code) {
    const promo = await database.query(
      `SELECT * FROM promotions WHERE code=$1 AND start_date<=NOW() AND end_date>=NOW()`,
      [promo_code]
    );
    if (promo.rows.length === 0)
      return next(new ErrorHandler("Invalid or expired promo code.", 400));
    discountAmount = (totalPrice * promo.rows[0].discount_percent) / 100;
    totalPrice = totalPrice - discountAmount;
  }

  const orderResult = await database.query(
    `INSERT INTO orders (user_id, status, payment_method, payment_status, total_price, discount_amount, promo_code, shipping_address, shipping_city, shipping_country, notes)
     VALUES ($1, 'pending', $2, 'pending', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.user.id, payment_method, totalPrice, discountAmount, promo_code || null, shipping_address, shipping_city, shipping_country || "Tunisie", notes || null]
  );

  const order = orderResult.rows[0];

  for (const item of orderItems) {
    await database.query(
      `INSERT INTO order_items (order_id, variant_id, product_name, variant_details, quantity, price_at_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.id, item.variant_id, item.product_name, JSON.stringify(item.variant_details), item.quantity, item.price_at_order]
    );
    await database.query("UPDATE product_variants SET stock = stock - $1 WHERE id = $2", [item.quantity, item.variant_id]);
  }

  await database.query("INSERT INTO deliveries (order_id, status) VALUES ($1, 'preparing')", [order.id]);

  // ✅ Email de confirmation
  await sendOrderConfirmationEmail(req.user.email, order);

  if (payment_method === "stripe") {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100), currency: "usd",
      metadata: { order_id: order.id },
    });
    await database.query("UPDATE orders SET payment_id=$1 WHERE id=$2", [paymentIntent.id, order.id]);
    return res.status(201).json({ success: true, message: "Order created.", order, payment: { method: "stripe", client_secret: paymentIntent.client_secret } });
  }

  if (payment_method === "paypal") {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: totalPrice.toFixed(2) } }] });
    const paypalOrder = await paypalClient().execute(request);
    await database.query("UPDATE orders SET payment_id=$1 WHERE id=$2", [paypalOrder.result.id, order.id]);
    const approvalUrl = paypalOrder.result.links.find(l => l.rel === "approve").href;
    return res.status(201).json({ success: true, order, payment: { method: "paypal", approval_url: approvalUrl, paypal_order_id: paypalOrder.result.id } });
  }

  return res.status(201).json({ success: true, message: "Order created. Pay on delivery.", order, payment: { method: "cod" } });
});


// ═══════════════════════════════════════════════════════════
// CONFIRM STRIPE PAYMENT
// ═══════════════════════════════════════════════════════════
export const confirmStripePayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const orderResult = await database.query("SELECT * FROM orders WHERE id=$1 AND user_id=$2", [orderId, req.user.id]);
  if (orderResult.rows.length === 0) return next(new ErrorHandler("Order not found.", 404));
  const order = orderResult.rows[0];
  const paymentIntent = await stripe.paymentIntents.retrieve(order.payment_id);
  if (paymentIntent.status !== "succeeded") return next(new ErrorHandler("Payment not completed.", 400));
  await database.query("UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=$1", [orderId]);
  res.status(200).json({ success: true, message: "Payment confirmed." });
});


// ═══════════════════════════════════════════════════════════
// CONFIRM PAYPAL PAYMENT
// ═══════════════════════════════════════════════════════════
export const confirmPaypalPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const { paypal_order_id } = req.body;
  const orderResult = await database.query("SELECT * FROM orders WHERE id=$1 AND user_id=$2", [orderId, req.user.id]);
  if (orderResult.rows.length === 0) return next(new ErrorHandler("Order not found.", 404));
  const request = new paypal.orders.OrdersCaptureRequest(paypal_order_id);
  request.requestBody({});
  const capture = await paypalClient().execute(request);
  if (capture.result.status !== "COMPLETED") return next(new ErrorHandler("PayPal payment not completed.", 400));
  await database.query("UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=$1", [orderId]);
  res.status(200).json({ success: true, message: "PayPal payment confirmed." });
});


// ═══════════════════════════════════════════════════════════
// GET MY ORDERS
// ═══════════════════════════════════════════════════════════
export const getMyOrders = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT o.*, d.status AS delivery_status, d.tracking_number, d.carrier, d.estimated_date, COUNT(oi.id) AS item_count
     FROM orders o
     LEFT JOIN deliveries d ON d.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id, d.status, d.tracking_number, d.carrier, d.estimated_date
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  res.status(200).json({ success: true, totalOrders: result.rows.length, orders: result.rows });
});


// ═══════════════════════════════════════════════════════════
// GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════
export const getSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const orderResult = await database.query(
    `SELECT o.*, d.status AS delivery_status, d.tracking_number, d.carrier, d.estimated_date, d.delivered_at, d.notes AS delivery_notes
     FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id
     WHERE o.id = $1 AND (o.user_id = $2 OR $3 = 'admin')`,
    [orderId, req.user.id, req.user.role]
  );
  if (orderResult.rows.length === 0) return next(new ErrorHandler("Order not found.", 404));
  const order = orderResult.rows[0];
  const itemsResult = await database.query(
    `SELECT oi.*, pv.images FROM order_items oi LEFT JOIN product_variants pv ON pv.id = oi.variant_id WHERE oi.order_id = $1`,
    [orderId]
  );
  order.items = itemsResult.rows;
  res.status(200).json({ success: true, order });
});


// ═══════════════════════════════════════════════════════════
// CANCEL ORDER
// ═══════════════════════════════════════════════════════════
export const cancelOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const orderResult = await database.query("SELECT * FROM orders WHERE id=$1 AND user_id=$2", [orderId, req.user.id]);
  if (orderResult.rows.length === 0) return next(new ErrorHandler("Order not found.", 404));
  const order = orderResult.rows[0];
  if (!["pending", "confirmed"].includes(order.status))
    return next(new ErrorHandler(`Cannot cancel order with status '${order.status}'.`, 400));
  const items = await database.query("SELECT * FROM order_items WHERE order_id=$1", [orderId]);
  for (const item of items.rows) {
    await database.query("UPDATE product_variants SET stock = stock + $1 WHERE id = $2", [item.quantity, item.variant_id]);
  }
  if (order.payment_status === "paid" && order.payment_method === "stripe" && order.payment_id) {
    await stripe.refunds.create({ payment_intent: order.payment_id });
    await database.query("UPDATE orders SET payment_status='refunded' WHERE id=$1", [orderId]);
  }
  await database.query("UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]);
  // ✅ Met à jour le statut de livraison aussi
  await database.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1", [orderId]);
  res.status(200).json({ success: true, message: "Order cancelled successfully." });
});


// ═══════════════════════════════════════════════════════════
// GET ALL ORDERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllOrders = catchAsyncErrors(async (req, res, next) => {
  const { status, payment_status } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  let index = 1;
  if (status) { conditions.push(`o.status = $${index}`); values.push(status); index++; }
  if (payment_status) { conditions.push(`o.payment_status = $${index}`); values.push(payment_status); index++; }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const totalResult = await database.query(`SELECT COUNT(*) FROM orders o ${whereClause}`, values);
  const totalOrders = parseInt(totalResult.rows[0].count);
  values.push(limit, offset);
  const result = await database.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, d.status AS delivery_status, d.tracking_number, COUNT(oi.id) AS item_count
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN deliveries d ON d.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${whereClause}
     GROUP BY o.id, u.name, u.email, d.status, d.tracking_number
     ORDER BY o.created_at DESC LIMIT $${index} OFFSET $${index + 1}`,
    values
  );
  res.status(200).json({ success: true, totalOrders, page, totalPages: Math.ceil(totalOrders / limit), orders: result.rows });
});


// ═══════════════════════════════════════════════════════════
// UPDATE ORDER STATUS (admin)
// ═══════════════════════════════════════════════════════════
export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status))
    return next(new ErrorHandler(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400));
  const order = await database.query("SELECT * FROM orders WHERE id=$1", [orderId]);
  if (order.rows.length === 0) return next(new ErrorHandler("Order not found.", 404));
  await database.query("UPDATE orders SET status=$1 WHERE id=$2", [status, orderId]);
  if (status === "shipped") await database.query("UPDATE deliveries SET status='shipped' WHERE order_id=$1", [orderId]);
  if (status === "delivered") await database.query("UPDATE deliveries SET status='delivered', delivered_at=NOW() WHERE order_id=$1", [orderId]);
  res.status(200).json({ success: true, message: `Order status updated to '${status}'.` });
});


// ═══════════════════════════════════════════════════════════
// UPDATE DELIVERY (admin)
// ═══════════════════════════════════════════════════════════
export const updateDelivery = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const { carrier, tracking_number, estimated_date, status, notes } = req.body;
  const delivery = await database.query("SELECT * FROM deliveries WHERE order_id=$1", [orderId]);
  if (delivery.rows.length === 0) return next(new ErrorHandler("Delivery not found.", 404));
  const current = delivery.rows[0];
  const result = await database.query(
    `UPDATE deliveries SET carrier=$1, tracking_number=$2, estimated_date=$3, status=$4, notes=$5 WHERE order_id=$6 RETURNING *`,
    [carrier || current.carrier, tracking_number || current.tracking_number, estimated_date || current.estimated_date, status || current.status, notes || current.notes, orderId]
  );
  res.status(200).json({ success: true, message: "Delivery updated successfully.", delivery: result.rows[0] });
});


// ═══════════════════════════════════════════════════════════
// CREATE GUEST ORDER
// POST /api/orders/guest
// ═══════════════════════════════════════════════════════════
export const createGuestOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    items, payment_method, name, email, phone,
    shipping_address, shipping_city, shipping_country, promo_code, notes,
  } = req.body;

  if (!items || items.length === 0) return next(new ErrorHandler("Please provide at least one item.", 400));
  if (!payment_method) return next(new ErrorHandler("Please provide a payment method.", 400));
  if (!name || !email) return next(new ErrorHandler("Please provide your name and email.", 400));
  if (!shipping_address || !shipping_city) return next(new ErrorHandler("Please provide shipping address and city.", 400));

  let user;
  const existingUser = await database.query("SELECT * FROM users WHERE email=$1", [email]);

  if (existingUser.rows.length > 0) {
    user = existingUser.rows[0];
  } else {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const completeAccountToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // ✅ Nouveau — avec address et city
const newUser = await database.query(
  `INSERT INTO users 
    (name, email, phone, address, city, role, is_verified, 
     complete_account_token, complete_account_expire)
   VALUES ($1, $2, $3, $4, $5, 'user', false, $6, $7) 
   RETURNING *`,
  [name, email, phone || null, shipping_address, shipping_city, 
   completeAccountToken, expireTime]
);
    user = newUser.rows[0];

    const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${rawToken}`;
    await sendEmail({
      to: email,
      subject: "Créez votre mot de passe — GOFFA 🧺",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
            <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
          </div>
          <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
            <h2>Bienvenue ${name} !</h2>
            <p>Votre commande a été passée avec succès. Un compte a été créé pour vous.</p>
            <p>Cliquez ci-dessous pour définir votre mot de passe et accéder à votre historique de commandes :</p>
            <a href="${completeUrl}" style="background: #166534; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0;">
              Créer mon mot de passe →
            </a>
            <p style="color: #666; font-size: 14px;">Ce lien expire dans <strong>7 jours</strong>.</p>
          </div>
        </div>
      `,
    });
  }

  let totalPrice = 0;
  let orderItems = [];

  for (const item of items) {
    const { variant_id, quantity } = item;
    if (!variant_id || !quantity || quantity < 1)
      return next(new ErrorHandler("Each item must have a variant_id and quantity.", 400));
    const variantResult = await database.query(
      `SELECT pv.*, p.name AS product_name,
         COALESCE(json_agg(json_build_object('attribute_type', at.name, 'attribute_value', av.value)) FILTER (WHERE at.id IS NOT NULL), '[]') AS attributes
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN attribute_values av ON av.id = va.attribute_value_id
       LEFT JOIN attribute_types at ON at.id = av.attribute_type_id
       WHERE pv.id = $1 GROUP BY pv.id, p.name`,
      [variant_id]
    );
    if (variantResult.rows.length === 0) return next(new ErrorHandler(`Variant ${variant_id} not found.`, 404));
    const variant = variantResult.rows[0];
    if (variant.stock < quantity) return next(new ErrorHandler(`Not enough stock for ${variant.product_name}. Available: ${variant.stock}`, 400));
    totalPrice += variant.price * quantity;
    orderItems.push({ variant_id, quantity, price_at_order: variant.price, product_name: variant.product_name, variant_details: variant.attributes });
  }

  let discountAmount = 0;
  if (promo_code) {
    const promo = await database.query(`SELECT * FROM promotions WHERE code=$1 AND start_date<=NOW() AND end_date>=NOW()`, [promo_code]);
    if (promo.rows.length === 0) return next(new ErrorHandler("Invalid or expired promo code.", 400));
    discountAmount = (totalPrice * promo.rows[0].discount_percent) / 100;
    totalPrice = totalPrice - discountAmount;
  }

  const orderResult = await database.query(
    `INSERT INTO orders (user_id, status, payment_method, payment_status, total_price, discount_amount, promo_code, shipping_address, shipping_city, shipping_country, notes)
     VALUES ($1, 'pending', $2, 'pending', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [user.id, payment_method, totalPrice, discountAmount, promo_code || null, shipping_address, shipping_city, shipping_country || "Tunisie", notes || null]
  );

  const order = orderResult.rows[0];

  for (const item of orderItems) {
    await database.query(
      `INSERT INTO order_items (order_id, variant_id, product_name, variant_details, quantity, price_at_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.id, item.variant_id, item.product_name, JSON.stringify(item.variant_details), item.quantity, item.price_at_order]
    );
    await database.query("UPDATE product_variants SET stock = stock - $1 WHERE id=$2", [item.quantity, item.variant_id]);
  }

  await database.query("INSERT INTO deliveries (order_id, status) VALUES ($1, 'preparing')", [order.id]);

  // ✅ Email de confirmation de commande
  await sendOrderConfirmationEmail(email, order);

  if (payment_method === "stripe") {
    const paymentIntent = await stripe.paymentIntents.create({ amount: Math.round(totalPrice * 100), currency: "usd", metadata: { order_id: order.id } });
    await database.query("UPDATE orders SET payment_id=$1 WHERE id=$2", [paymentIntent.id, order.id]);
    return res.status(201).json({ success: true, order, payment: { method: "stripe", client_secret: paymentIntent.client_secret } });
  }

  if (payment_method === "paypal") {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: totalPrice.toFixed(2) } }] });
    const paypalOrder = await paypalClient().execute(request);
    await database.query("UPDATE orders SET payment_id=$1 WHERE id=$2", [paypalOrder.result.id, order.id]);
    const approvalUrl = paypalOrder.result.links.find(l => l.rel === "approve").href;
    return res.status(201).json({ success: true, order, payment: { method: "paypal", approval_url: approvalUrl, paypal_order_id: paypalOrder.result.id } });
  }

  return res.status(201).json({ success: true, message: "Order created. Pay on delivery.", order, payment: { method: "cod" } });
});