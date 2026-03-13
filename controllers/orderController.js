import Stripe from "stripe";
import paypal from "@paypal/checkout-server-sdk";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import paypalClient from "../config/paypal.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ═══════════════════════════════════════════════════════════
// CREATE ORDER
// POST /api/orders
// Requires: isAuthenticated
// Body: {
//   items: [{ variant_id, quantity }],
//   payment_method: "stripe" | "paypal" | "cod",
//   shipping_address, shipping_city, shipping_country,
//   promo_code (optional), notes (optional)
// }
// ═══════════════════════════════════════════════════════════
export const createOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    items,
    payment_method,
    shipping_address,
    shipping_city,
    shipping_country,
    promo_code,
    notes,
  } = req.body;

  // ── Validation ────────────────────────────────────────
  if (!items || items.length === 0)
    return next(new ErrorHandler("Please provide at least one item.", 400));

  if (!payment_method)
    return next(new ErrorHandler("Please provide a payment method.", 400));

  if (!shipping_address || !shipping_city)
    return next(new ErrorHandler("Please provide shipping address and city.", 400));

  // ── Calculate total price ─────────────────────────────
  let totalPrice    = 0;
  let orderItems    = [];

  for (const item of items) {
    const { variant_id, quantity } = item;

    if (!variant_id || !quantity || quantity < 1)
      return next(new ErrorHandler("Each item must have a variant_id and quantity.", 400));

    // Get variant with product info
    const variantResult = await database.query(
      `SELECT
         pv.*,
         p.name AS product_name,
         -- Get all attributes of this variant
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name,
               'attribute_value', av.value
             )
           ) FILTER (WHERE at.id IS NOT NULL), '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN products          p  ON p.id  = pv.product_id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN attribute_values   av ON av.id = va.attribute_value_id
       LEFT JOIN attribute_types    at ON at.id = av.attribute_type_id
       WHERE pv.id = $1
       GROUP BY pv.id, p.name`,
      [variant_id]
    );

    if (variantResult.rows.length === 0)
      return next(new ErrorHandler(`Variant ${variant_id} not found.`, 404));

    const variant = variantResult.rows[0];

    // Check stock availability
    if (variant.stock < quantity)
      return next(
        new ErrorHandler(
          `Not enough stock for ${variant.product_name}. Available: ${variant.stock}`,
          400
        )
      );

    totalPrice += variant.price * quantity;

    orderItems.push({
      variant_id,
      quantity,
      price_at_order:  variant.price,
      product_name:    variant.product_name,
      variant_details: variant.attributes,
    });
  }

  // ── Apply promo code if provided ──────────────────────
  let discountAmount = 0;

  if (promo_code) {
    const promo = await database.query(
      `SELECT * FROM promotions
       WHERE code = $1
       AND start_date <= NOW()
       AND end_date >= NOW()`,
      [promo_code]
    );

    if (promo.rows.length === 0)
      return next(new ErrorHandler("Invalid or expired promo code.", 400));

    const discount = promo.rows[0];
    discountAmount = (totalPrice * discount.discount_percent) / 100;
    totalPrice     = totalPrice - discountAmount;
  }

  // ── Create order in database ──────────────────────────
  const orderResult = await database.query(
    `INSERT INTO orders
      (user_id, status, payment_method, payment_status,
       total_price, discount_amount, promo_code,
       shipping_address, shipping_city, shipping_country, notes)
     VALUES ($1, 'pending', $2, 'pending', $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      req.user.id,
      payment_method,
      totalPrice,
      discountAmount,
      promo_code    || null,
      shipping_address,
      shipping_city,
      shipping_country || "Switzerland",
      notes         || null,
    ]
  );

  const order = orderResult.rows[0];

  // ── Insert order items ────────────────────────────────
  for (const item of orderItems) {
    await database.query(
      `INSERT INTO order_items
        (order_id, variant_id, product_name, variant_details, quantity, price_at_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        order.id,
        item.variant_id,
        item.product_name,
        JSON.stringify(item.variant_details),
        item.quantity,
        item.price_at_order,
      ]
    );

    // ── Reduce stock for each variant ─────────────────
    await database.query(
      "UPDATE product_variants SET stock = stock - $1 WHERE id = $2",
      [item.quantity, item.variant_id]
    );
  }

  // ── Create delivery record ────────────────────────────
  await database.query(
    "INSERT INTO deliveries (order_id, status) VALUES ($1, 'preparing')",
    [order.id]
  );

  // ── Handle payment ────────────────────────────────────

  // ── STRIPE ────────────────────────────────────────────
  if (payment_method === "stripe") {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(totalPrice * 100), // Stripe uses cents
      currency: "chf",                         // Swiss Franc
      metadata: { order_id: order.id },
    });

    // Update order with Stripe payment intent ID
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paymentIntent.id, order.id]
    );

    return res.status(201).json({
      success:       true,
      message:       "Order created. Complete payment with Stripe.",
      order,
      payment: {
        method:        "stripe",
        client_secret: paymentIntent.client_secret, // sent to frontend to complete payment
      },
    });
  }

  // ── PAYPAL ────────────────────────────────────────────
  if (payment_method === "paypal") {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "CHF",
            value:         totalPrice.toFixed(2),
          },
          description: `Order ${order.id}`,
        },
      ],
    });

    const paypalOrder = await paypalClient().execute(request);

    // Update order with PayPal order ID
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paypalOrder.result.id, order.id]
    );

    // Get approval URL to redirect user to PayPal
    const approvalUrl = paypalOrder.result.links.find(
      (link) => link.rel === "approve"
    ).href;

    return res.status(201).json({
      success: true,
      message: "Order created. Complete payment with PayPal.",
      order,
      payment: {
        method:       "paypal",
        approval_url: approvalUrl, // frontend redirects user here
        paypal_order_id: paypalOrder.result.id,
      },
    });
  }

  // ── CASH ON DELIVERY ──────────────────────────────────
  if (payment_method === "cod") {
    return res.status(201).json({
      success: true,
      message: "Order created. Pay on delivery.",
      order,
      payment: {
        method: "cod",
      },
    });
  }
});


// ═══════════════════════════════════════════════════════════
// CONFIRM STRIPE PAYMENT
// POST /api/orders/:orderId/stripe/confirm
// Called after frontend confirms Stripe payment
// ═══════════════════════════════════════════════════════════
export const confirmStripePayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;

  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, req.user.id]
  );

  if (orderResult.rows.length === 0)
    return next(new ErrorHandler("Order not found.", 404));

  const order = orderResult.rows[0];

  // Verify payment with Stripe
  const paymentIntent = await stripe.paymentIntents.retrieve(order.payment_id);

  if (paymentIntent.status !== "succeeded")
    return next(new ErrorHandler("Payment not completed.", 400));

  // Update order payment status
  await database.query(
    "UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=$1",
    [orderId]
  );

  res.status(200).json({
    success: true,
    message: "Payment confirmed. Order is being processed.",
  });
});


// ═══════════════════════════════════════════════════════════
// CONFIRM PAYPAL PAYMENT
// POST /api/orders/:orderId/paypal/confirm
// Body: { paypal_order_id }
// Called after user approves PayPal payment
// ═══════════════════════════════════════════════════════════
export const confirmPaypalPayment = catchAsyncErrors(async (req, res, next) => {
  const { orderId }       = req.params;
  const { paypal_order_id } = req.body;

  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, req.user.id]
  );

  if (orderResult.rows.length === 0)
    return next(new ErrorHandler("Order not found.", 404));

  // Capture PayPal payment
  const request = new paypal.orders.OrdersCaptureRequest(paypal_order_id);
  request.requestBody({});

  const capture = await paypalClient().execute(request);

  if (capture.result.status !== "COMPLETED")
    return next(new ErrorHandler("PayPal payment not completed.", 400));

  // Update order payment status
  await database.query(
    "UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=$1",
    [orderId]
  );

  res.status(200).json({
    success: true,
    message: "PayPal payment confirmed. Order is being processed.",
  });
});


// ═══════════════════════════════════════════════════════════
// GET MY ORDERS
// GET /api/orders/my
// Requires: isAuthenticated
// Returns all orders of the logged-in user
// ═══════════════════════════════════════════════════════════
export const getMyOrders = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT
       o.*,
       d.status        AS delivery_status,
       d.tracking_number,
       d.carrier,
       d.estimated_date,
       COUNT(oi.id)    AS item_count
     FROM orders o
     LEFT JOIN deliveries  d  ON d.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id, d.status, d.tracking_number, d.carrier, d.estimated_date
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );

  res.status(200).json({
    success:     true,
    totalOrders: result.rows.length,
    orders:      result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// GET SINGLE ORDER
// GET /api/orders/:orderId
// Requires: isAuthenticated
// Returns full order with items and delivery
// ═══════════════════════════════════════════════════════════
export const getSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;

  // Get order (user can only see their own orders)
  const orderResult = await database.query(
    `SELECT o.*, d.status AS delivery_status, d.tracking_number,
       d.carrier, d.estimated_date, d.delivered_at, d.notes AS delivery_notes
     FROM orders o
     LEFT JOIN deliveries d ON d.order_id = o.id
     WHERE o.id = $1 AND (o.user_id = $2 OR $3 = 'admin')`,
    [orderId, req.user.id, req.user.role]
  );

  if (orderResult.rows.length === 0)
    return next(new ErrorHandler("Order not found.", 404));

  const order = orderResult.rows[0];

  // Get order items
  const itemsResult = await database.query(
    `SELECT oi.*, pv.images
     FROM order_items oi
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  order.items = itemsResult.rows;

  res.status(200).json({
    success: true,
    order,
  });
});


// ═══════════════════════════════════════════════════════════
// CANCEL ORDER
// PATCH /api/orders/:orderId/cancel
// Requires: isAuthenticated
// Only possible if status is 'pending' or 'confirmed'
// ═══════════════════════════════════════════════════════════
export const cancelOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;

  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, req.user.id]
  );

  if (orderResult.rows.length === 0)
    return next(new ErrorHandler("Order not found.", 404));

  const order = orderResult.rows[0];

  // Can only cancel pending or confirmed orders
  if (!["pending", "confirmed"].includes(order.status))
    return next(
      new ErrorHandler(
        `Cannot cancel order with status '${order.status}'.`,
        400
      )
    );

  // ── Restore stock for each item ───────────────────────
  const items = await database.query(
    "SELECT * FROM order_items WHERE order_id=$1", [orderId]
  );

  for (const item of items.rows) {
    await database.query(
      "UPDATE product_variants SET stock = stock + $1 WHERE id = $2",
      [item.quantity, item.variant_id]
    );
  }

  // ── Refund if paid ────────────────────────────────────
  if (order.payment_status === "paid") {
    if (order.payment_method === "stripe" && order.payment_id) {
      await stripe.refunds.create({ payment_intent: order.payment_id });
    }
    // PayPal refunds require manual processing in sandbox
    await database.query(
      "UPDATE orders SET payment_status='refunded' WHERE id=$1", [orderId]
    );
  }

  // Update order status
  await database.query(
    "UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]
  );

  res.status(200).json({
    success: true,
    message: "Order cancelled successfully.",
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL ORDERS (admin only)
// GET /api/orders
// Supports: ?status= ?payment_status= ?page=
// ═══════════════════════════════════════════════════════════
export const getAllOrders = catchAsyncErrors(async (req, res, next) => {
  const { status, payment_status } = req.query;
  const page   = parseInt(req.query.page) || 1;
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (status) {
    conditions.push(`o.status = $${index}`);
    values.push(status);
    index++;
  }

  if (payment_status) {
    conditions.push(`o.payment_status = $${index}`);
    values.push(payment_status);
    index++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const totalResult = await database.query(
    `SELECT COUNT(*) FROM orders o ${whereClause}`, values
  );
  const totalOrders = parseInt(totalResult.rows[0].count);

  values.push(limit, offset);

  const result = await database.query(
    `SELECT
       o.*,
       u.name          AS customer_name,
       u.email         AS customer_email,
       d.status        AS delivery_status,
       d.tracking_number,
       COUNT(oi.id)    AS item_count
     FROM orders o
     LEFT JOIN users       u  ON u.id  = o.user_id
     LEFT JOIN deliveries  d  ON d.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${whereClause}
     GROUP BY o.id, u.name, u.email, d.status, d.tracking_number
     ORDER BY o.created_at DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    values
  );

  res.status(200).json({
    success:     true,
    totalOrders,
    page,
    totalPages:  Math.ceil(totalOrders / limit),
    orders:      result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE ORDER STATUS (admin only)
// PATCH /api/orders/:orderId/status
// Body: { status }
// ═══════════════════════════════════════════════════════════
export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const { status }  = req.body;

  const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status))
    return next(new ErrorHandler(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400));

  const order = await database.query(
    "SELECT * FROM orders WHERE id=$1", [orderId]
  );
  if (order.rows.length === 0)
    return next(new ErrorHandler("Order not found.", 404));

  await database.query(
    "UPDATE orders SET status=$1 WHERE id=$2",
    [status, orderId]
  );

  // Auto update delivery status when order is shipped or delivered
  if (status === "shipped") {
    await database.query(
      "UPDATE deliveries SET status='shipped' WHERE order_id=$1", [orderId]
    );
  }

  if (status === "delivered") {
    await database.query(
      `UPDATE deliveries
       SET status='delivered', delivered_at=NOW()
       WHERE order_id=$1`,
      [orderId]
    );
  }

  res.status(200).json({
    success: true,
    message: `Order status updated to '${status}'.`,
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE DELIVERY (admin only)
// PATCH /api/orders/:orderId/delivery
// Body: { carrier, tracking_number, estimated_date, status, notes }
// ═══════════════════════════════════════════════════════════
export const updateDelivery = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const { carrier, tracking_number, estimated_date, status, notes } = req.body;

  const delivery = await database.query(
    "SELECT * FROM deliveries WHERE order_id=$1", [orderId]
  );
  if (delivery.rows.length === 0)
    return next(new ErrorHandler("Delivery not found.", 404));

  const current = delivery.rows[0];

  const result = await database.query(
    `UPDATE deliveries
     SET carrier=$1, tracking_number=$2, estimated_date=$3, status=$4, notes=$5
     WHERE order_id=$6 RETURNING *`,
    [
      carrier         || current.carrier,
      tracking_number || current.tracking_number,
      estimated_date  || current.estimated_date,
      status          || current.status,
      notes           || current.notes,
      orderId,
    ]
  );

  res.status(200).json({
    success:  true,
    message:  "Delivery updated successfully.",
    delivery: result.rows[0],
  });
});
// CREATE GUEST ORDER
// POST /api/orders/guest
// No authentication required
// Body: {
//   items: [{ variant_id, quantity }],
//   payment_method: "stripe" | "paypal" | "cod",
//   name, email, phone,
//   shipping_address, shipping_city, shipping_country,
//   promo_code (optional), notes (optional)
// }
// → Creates order + creates unverified account + sends email
// ═══════════════════════════════════════════════════════════
export const createGuestOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    items,
    payment_method,
    name,
    email,
    phone,
    shipping_address,
    shipping_city,
    shipping_country,
    promo_code,
    notes,
  } = req.body;
 
  // ── Validation ────────────────────────────────────────
  if (!items || items.length === 0)
    return next(new ErrorHandler("Please provide at least one item.", 400));
  if (!payment_method)
    return next(new ErrorHandler("Please provide a payment method.", 400));
  if (!name || !email)
    return next(new ErrorHandler("Please provide your name and email.", 400));
  if (!shipping_address || !shipping_city)
    return next(new ErrorHandler("Please provide shipping address and city.", 400));
 
  // ── Check if user already exists ─────────────────────
  let user;
  const existingUser = await database.query(
    "SELECT * FROM users WHERE email=$1", [email]
  );
 
  if (existingUser.rows.length > 0) {
    // User already exists → use their account
    user = existingUser.rows[0];
  } else {
    // ── Create guest account (no password yet) ────────
    const rawToken             = crypto.randomBytes(32).toString("hex");
    const completeAccountToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
 
    const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
 
    const newUser = await database.query(
      `INSERT INTO users
        (name, email, phone, role, is_verified,
         complete_account_token, complete_account_expire)
       VALUES ($1, $2, $3, 'user', false, $4, $5)
       RETURNING *`,
      [name, email, phone || null, completeAccountToken, expireTime]
    );
 
    user = newUser.rows[0];
 
    // ── Send complete account email ───────────────────
    const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${rawToken}`;
 
    await sendEmail({
      to:      email,
      subject: "Complete your account — Ecommerce",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome ${name} !</h2>
          <p>Your order has been placed successfully.</p>
          <p>We created an account for you. Click the button below to set your password
             and access your order history anytime.</p>
          <a href="${completeUrl}"
             style="background: #4F46E5; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; display: inline-block;">
            Complete my account
          </a>
          <p style="margin-top: 16px; color: #666;">
            This link expires in <strong>7 days</strong>.
          </p>
        </div>
      `,
    });
  }
 
  // ── Calculate total price ─────────────────────────────
  let totalPrice = 0;
  let orderItems = [];
 
  for (const item of items) {
    const { variant_id, quantity } = item;
 
    if (!variant_id || !quantity || quantity < 1)
      return next(new ErrorHandler("Each item must have a variant_id and quantity.", 400));
 
    const variantResult = await database.query(
      `SELECT
         pv.*,
         p.name AS product_name,
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name,
               'attribute_value', av.value
             )
           ) FILTER (WHERE at.id IS NOT NULL), '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN products          p  ON p.id  = pv.product_id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN attribute_values   av ON av.id = va.attribute_value_id
       LEFT JOIN attribute_types    at ON at.id = av.attribute_type_id
       WHERE pv.id = $1
       GROUP BY pv.id, p.name`,
      [variant_id]
    );
 
    if (variantResult.rows.length === 0)
      return next(new ErrorHandler(`Variant ${variant_id} not found.`, 404));
 
    const variant = variantResult.rows[0];
 
    if (variant.stock < quantity)
      return next(
        new ErrorHandler(
          `Not enough stock for ${variant.product_name}. Available: ${variant.stock}`, 400
        )
      );
 
    totalPrice += variant.price * quantity;
    orderItems.push({
      variant_id,
      quantity,
      price_at_order:  variant.price,
      product_name:    variant.product_name,
      variant_details: variant.attributes,
    });
  }
 
  // ── Apply promo code if provided ──────────────────────
  let discountAmount = 0;
  if (promo_code) {
    const promo = await database.query(
      `SELECT * FROM promotions
       WHERE code=$1 AND start_date<=NOW() AND end_date>=NOW()`,
      [promo_code]
    );
    if (promo.rows.length === 0)
      return next(new ErrorHandler("Invalid or expired promo code.", 400));
 
    discountAmount = (totalPrice * promo.rows[0].discount_percent) / 100;
    totalPrice     = totalPrice - discountAmount;
  }
 
  // ── Create order ──────────────────────────────────────
  const orderResult = await database.query(
    `INSERT INTO orders
      (user_id, status, payment_method, payment_status,
       total_price, discount_amount, promo_code,
       shipping_address, shipping_city, shipping_country, notes)
     VALUES ($1, 'pending', $2, 'pending', $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      user.id,
      payment_method,
      totalPrice,
      discountAmount,
      promo_code       || null,
      shipping_address,
      shipping_city,
      shipping_country || "Switzerland",
      notes            || null,
    ]
  );
 
  const order = orderResult.rows[0];
 
  // ── Insert order items ────────────────────────────────
  for (const item of orderItems) {
    await database.query(
      `INSERT INTO order_items
        (order_id, variant_id, product_name, variant_details, quantity, price_at_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        order.id,
        item.variant_id,
        item.product_name,
        JSON.stringify(item.variant_details),
        item.quantity,
        item.price_at_order,
      ]
    );
 
    // Reduce stock
    await database.query(
      "UPDATE product_variants SET stock = stock - $1 WHERE id=$2",
      [item.quantity, item.variant_id]
    );
  }
 
  // ── Create delivery record ────────────────────────────
  await database.query(
    "INSERT INTO deliveries (order_id, status) VALUES ($1, 'preparing')",
    [order.id]
  );
 
  // ── Handle payment ────────────────────────────────────
  if (payment_method === "stripe") {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(totalPrice * 100),
      currency: "chf",
      metadata: { order_id: order.id },
    });
 
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paymentIntent.id, order.id]
    );
 
    return res.status(201).json({
      success: true,
      message: "Order created. Complete payment with Stripe.",
      order,
      payment: {
        method:        "stripe",
        client_secret: paymentIntent.client_secret,
      },
    });
  }
 
  if (payment_method === "paypal") {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "CHF",
            value:         totalPrice.toFixed(2),
          },
        },
      ],
    });
 
    const paypalOrder = await paypalClient().execute(request);
 
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paypalOrder.result.id, order.id]
    );
 
    const approvalUrl = paypalOrder.result.links.find(
      (link) => link.rel === "approve"
    ).href;
 
    return res.status(201).json({
      success: true,
      message: "Order created. Complete payment with PayPal.",
      order,
      payment: {
        method:          "paypal",
        approval_url:    approvalUrl,
        paypal_order_id: paypalOrder.result.id,
      },
    });
  }
 
  // COD
  return res.status(201).json({
    success: true,
    message: "Order created. Pay on delivery.",
    order,
    payment: { method: "cod" },
  });
});
 