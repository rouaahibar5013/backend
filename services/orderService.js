import Stripe from "stripe";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail from "../utils/sendEmail.js";
import { createGuestAccountService } from "./authService.js";
import { exportOrderToOdoo } from "./odooService.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ═══════════════════════════════════════════════════════════
// HELPER — Email confirmation commande
// ═══════════════════════════════════════════════════════════
const sendOrderConfirmationEmail = async (toEmail, order, customerName) => {
  await sendEmail({
    to:      toEmail,
    subject: `✅ Commande #${order.order_number} confirmée — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #166534;">✅ Commande confirmée !</h2>
          <p>Bonjour ${customerName},</p>
          <p>Merci pour votre commande. Voici le récapitulatif :</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
            <p><strong>N° de commande :</strong> #${order.order_number}</p>
            <p><strong>Livraison à :</strong> ${order.shipping_full_name}, ${order.shipping_address}, ${order.shipping_city}</p>
            <p><strong>Mode de paiement :</strong> ${
              order.payment_method === 'cod'    ? '💵 Paiement à la livraison' :
              order.payment_method === 'stripe' ? '💳 Carte bancaire / Twint'  : order.payment_method
            }</p>
            ${order.discount_amount > 0 ? `<p><strong>Réduction :</strong> -${order.discount_amount} DT</p>` : ''}
            <p style="font-size: 20px; color: #166534;"><strong>Total : ${order.total_price} DT</strong></p>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.FRONTEND_URL}/commandes/${order.id}"
               style="background: #166534; color: white; padding: 12px 28px; border-radius: 6px;
                      text-decoration: none; font-weight: bold; display: inline-block;">
              Suivre ma commande →
            </a>
          </div>
        </div>
      </div>
    `,
  });
};


// ═══════════════════════════════════════════════════════════
// HELPER — Alerte stock faible/rupture pour admin
// ═══════════════════════════════════════════════════════════
const sendStockAlertEmail = async (productName, sku, stock) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const isOutOfStock = stock === 0;

  await sendEmail({
    to:      adminEmail,
    subject: `${isOutOfStock ? '🔴 RUPTURE' : '🟡 Stock faible'} — ${productName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${isOutOfStock ? '#dc2626' : '#f59e0b'}; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">
            ${isOutOfStock ? '🔴 Rupture de stock' : '🟡 Stock faible'}
          </h2>
        </div>
        <div style="padding: 20px; background: #fef2f2; border-radius: 0 0 8px 8px;">
          <p><strong>Produit :</strong> ${productName}</p>
          <p><strong>SKU :</strong> ${sku || 'N/A'}</p>
          <p><strong>Stock restant :</strong>
            <span style="color: ${isOutOfStock ? '#dc2626' : '#f59e0b'}; font-weight: bold; font-size: 18px;">
              ${isOutOfStock ? 'RUPTURE DE STOCK' : `${stock} unités`}
            </span>
          </p>
          <p>Veuillez réapprovisionner ce produit dès que possible.</p>
          <a href="${process.env.FRONTEND_URL}/admin/produits"
             style="background: #dc2626; color: white; padding: 10px 20px; border-radius: 6px;
                    text-decoration: none; display: inline-block; margin-top: 10px; font-weight: bold;">
            Gérer les stocks →
          </a>
        </div>
      </div>
    `,
  }).catch(err => console.error("Stock alert email error:", err.message));
};


// ═══════════════════════════════════════════════════════════
// HELPER — Calcul des articles de la commande
// ═══════════════════════════════════════════════════════════
const calculateOrderItems = async (items) => {
  let subtotal   = 0;
  const orderItems = [];

  for (const item of items) {
    const { variant_id, quantity } = item;

    if (!variant_id || !quantity || quantity < 1)
      throw new ErrorHandler("Chaque article doit avoir un variant_id et une quantité valide.", 400);

    const variantResult = await database.query(
      `SELECT
         pv.*,
         p.name_fr AS product_name_fr,
         p.name_ar AS product_name_ar,
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name_fr,
               'attribute_value', av.value_fr
             )
           ) FILTER (WHERE at.id IS NOT NULL), '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       LEFT JOIN product_variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN attribute_values   av ON av.id  = va.attribute_value_id
       LEFT JOIN attribute_types    at ON at.id  = av.attribute_type_id
       WHERE pv.id = $1
       GROUP BY pv.id, p.name_fr, p.name_ar`,
      [variant_id]
    );

    if (variantResult.rows.length === 0)
      throw new ErrorHandler(`Variante ${variant_id} introuvable.`, 404);

    const variant = variantResult.rows[0];

    subtotal += parseFloat(variant.price) * quantity;

    orderItems.push({
      variant_id,
      quantity,
      price_at_order:  variant.price,
      product_name_fr: variant.product_name_fr,
      product_name_ar: variant.product_name_ar,
      variant_details: variant.attributes,
      sku:             variant.sku || null,
      // Pour l'alerte stock
      _low_stock_threshold: variant.low_stock_threshold || 5,
    });
  }

  return { subtotal, orderItems };
};


// ═══════════════════════════════════════════════════════════
// HELPER — Appliquer code promo
// ═══════════════════════════════════════════════════════════
const applyPromoCode = async (code, subtotal) => {
  const promo = await database.query(
    `SELECT * FROM promotions
     WHERE UPPER(code) = UPPER($1)
     AND is_active   = true
     AND starts_at  <= NOW()
     AND expires_at >= NOW()
     AND (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );

  if (promo.rows.length === 0)
    throw new ErrorHandler("Code promo invalide ou expiré.", 400);

  const p = promo.rows[0];

  if (p.min_order_amount && subtotal < parseFloat(p.min_order_amount))
    throw new ErrorHandler(
      `Montant minimum requis : ${p.min_order_amount} DT pour ce code promo.`, 400
    );

  let discountAmount = 0;
  if (p.discount_type === 'percentage') {
    discountAmount = (subtotal * parseFloat(p.discount_value)) / 100;
  } else {
    // fixed
    discountAmount = Math.min(parseFloat(p.discount_value), subtotal);
  }

  return { discountAmount, promoId: p.id };
};


// ═══════════════════════════════════════════════════════════
// HELPER — Insérer les articles + gérer le stock
// ✅ Commande passe même en rupture de stock
// ✅ Alerte email admin si stock faible/rupture
// ═══════════════════════════════════════════════════════════
const insertOrderItems = async (orderId, orderItems) => {
  // Vérifier si stock géré par Odoo ou backend
  const settings = await database.query(
    "SELECT stock_managed_by FROM odoo_settings LIMIT 1"
  );
  const stockManagedBy = settings.rows[0]?.stock_managed_by || 'backend';

  for (const item of orderItems) {
    // Insérer l'article
    await database.query(
      `INSERT INTO order_items
        (order_id, variant_id, product_name_fr, product_name_ar,
         variant_details, sku, quantity, price_at_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        orderId,
        item.variant_id,
        item.product_name_fr,
        item.product_name_ar  || null,
        JSON.stringify(item.variant_details),
        item.sku              || null,
        item.quantity,
        item.price_at_order,
      ]
    );

    // ✅ Réduire stock si géré par backend (jamais négatif)
    if (stockManagedBy === 'backend') {
      await database.query(
        "UPDATE product_variants SET stock = GREATEST(stock - $1, 0) WHERE id=$2",
        [item.quantity, item.variant_id]
      );

      // ✅ Vérifier le stock après réduction
      const updatedVariant = await database.query(
        "SELECT stock, low_stock_threshold, sku FROM product_variants WHERE id=$1",
        [item.variant_id]
      );

      const v = updatedVariant.rows[0];
      if (v && v.stock <= (v.low_stock_threshold || 5)) {
        // ✅ Envoyer alerte email admin
        await sendStockAlertEmail(item.product_name_fr, v.sku, v.stock);
      }
    }
  }
};


// ═══════════════════════════════════════════════════════════
// HELPER — Créer paiement Stripe
// ✅ CHF pour Twint + cartes bancaires
// ═══════════════════════════════════════════════════════════
const createStripePayment = async (totalPrice, orderId, customerEmail) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount:               Math.round(totalPrice * 100), // centimes
    currency:             "chf",                        // ✅ Franc Suisse = Twint
    metadata:             { order_id: orderId },
    receipt_email:        customerEmail,
    payment_method_types: ["card", "twint"],             // ✅ Twint inclus
  });

  return paymentIntent;
};


// ═══════════════════════════════════════════════════════════
// HELPER — Construire et insérer la commande en DB
// ═══════════════════════════════════════════════════════════
const buildAndInsertOrder = async ({
  userId, payment_method,
  subtotal, discountAmount, promoCode, promoId,
  shipping_full_name, shipping_phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code,
  shipping_country, notes,
}) => {
  const shippingCost = 0; // Livraison gratuite pour l'instant
  const totalPrice   = subtotal - discountAmount + shippingCost;

  const orderResult = await database.query(
    `INSERT INTO orders (
       user_id, status, payment_method, payment_status,
       subtotal, shipping_cost, discount_amount, total_price,
       promo_code, promo_id,
       shipping_full_name, shipping_phone,
       shipping_address, shipping_city,
       shipping_governorate, shipping_postal_code,
       shipping_country, notes
     ) VALUES ($1,'pending',$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      userId, payment_method,
      subtotal, shippingCost, discountAmount, totalPrice,
      promoCode || null, promoId || null,
      shipping_full_name, shipping_phone || null,
      shipping_address, shipping_city,
      shipping_governorate || null, shipping_postal_code || null,
      shipping_country || 'TN', notes || null,
    ]
  );

  return { order: orderResult.rows[0], totalPrice };
};


// ═══════════════════════════════════════════════════════════
// HELPER — Finaliser la commande après insertion
// ═══════════════════════════════════════════════════════════
const finalizeOrder = async ({ order, orderItems, promoId, customerEmail, customerName }) => {
  // Insérer les articles
  await insertOrderItems(order.id, orderItems);

  // Créer la livraison
  await database.query(
    "INSERT INTO deliveries (order_id, status) VALUES ($1, 'preparing')",
    [order.id]
  );

  // Incrémenter used_count du promo
  if (promoId) {
    await database.query(
      "UPDATE promotions SET used_count = used_count + 1 WHERE id=$1",
      [promoId]
    );
  }

  // Email de confirmation
  await sendOrderConfirmationEmail(customerEmail, order, customerName);

  // Export vers Odoo si activé
  await exportOrderToOdoo(order.id).catch(err =>
    console.error("Odoo export error:", err.message)
  );
};


// ═══════════════════════════════════════════════════════════
// CREATE ORDER (user connecté)
// ═══════════════════════════════════════════════════════════
export const createOrderService = async ({
  userId, userEmail, userName,
  items, payment_method,
  shipping_full_name, shipping_phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code,
  shipping_country, promo_code, notes,
}) => {
  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const { order, totalPrice } = await buildAndInsertOrder({
    userId, payment_method,
    subtotal, discountAmount, promoCode: promo_code, promoId,
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, notes,
  });

  await finalizeOrder({
    order, orderItems, promoId,
    customerEmail: userEmail,
    customerName:  userName,
  });

  // Paiement Stripe
  if (payment_method === 'stripe') {
    const paymentIntent = await createStripePayment(totalPrice, order.id, userEmail);
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paymentIntent.id, order.id]
    );
    return {
      order,
      payment: {
        method:        'stripe',
        client_secret: paymentIntent.client_secret,
      },
    };
  }

  return { order, payment: { method: 'cod' } };
};


// ═══════════════════════════════════════════════════════════
// CREATE GUEST ORDER (user non connecté)
// ✅ Crée compte automatiquement
// ✅ Envoie email pour compléter le compte
// ═══════════════════════════════════════════════════════════
export const createGuestOrderService = async ({
  items, payment_method,
  name, email, phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code,
  shipping_country, promo_code, notes,
}) => {
  // ✅ Créer ou récupérer le compte guest
  const user = await createGuestAccountService({
    name, email, phone,
    shipping_address, shipping_city,
  });

  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const { order, totalPrice } = await buildAndInsertOrder({
    userId: user.id, payment_method,
    subtotal, discountAmount, promoCode: promo_code, promoId,
    shipping_full_name: name, shipping_phone: phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, notes,
  });

  await finalizeOrder({
    order, orderItems, promoId,
    customerEmail: email,
    customerName:  name,
  });

  // Paiement Stripe
  if (payment_method === 'stripe') {
    const paymentIntent = await createStripePayment(totalPrice, order.id, email);
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paymentIntent.id, order.id]
    );
    return {
      order,
      payment: {
        method:        'stripe',
        client_secret: paymentIntent.client_secret,
      },
    };
  }

  return { order, payment: { method: 'cod' } };
};


// ═══════════════════════════════════════════════════════════
// CONFIRM STRIPE PAYMENT (via webhook)
// ═══════════════════════════════════════════════════════════
export const confirmStripePaymentService = async ({ orderId, userId, role }) => {
  const condition = role === 'admin' ? "id=$1" : "id=$1 AND user_id=$2";
  const values    = role === 'admin' ? [orderId] : [orderId, userId];

  const orderResult = await database.query(
    `SELECT * FROM orders WHERE ${condition}`, values
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];

  const paymentIntent = await stripe.paymentIntents.retrieve(order.payment_id);
  if (paymentIntent.status !== 'succeeded')
    throw new ErrorHandler("Paiement non complété.", 400);

  await database.query(
    "UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=$1",
    [orderId]
  );

  return { message: "Paiement confirmé. Commande en cours de traitement." };
};


// ═══════════════════════════════════════════════════════════
// STRIPE WEBHOOK HANDLER
// ✅ Sécurisé avec signature Stripe
// ═══════════════════════════════════════════════════════════
export const handleStripeWebhookService = async (payload, signature) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new ErrorHandler(`Webhook invalide : ${err.message}`, 400);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const orderId       = paymentIntent.metadata.order_id;

      if (orderId) {
        await database.query(
          "UPDATE orders SET payment_status='paid', status='confirmed' WHERE payment_id=$1",
          [paymentIntent.id]
        );
        console.log(`✅ Stripe payment confirmed for order ${orderId}`);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      await database.query(
        "UPDATE orders SET payment_status='failed' WHERE payment_id=$1",
        [paymentIntent.id]
      );
      console.log(`❌ Stripe payment failed: ${paymentIntent.id}`);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      await database.query(
        "UPDATE orders SET payment_status='refunded' WHERE payment_id=$1",
        [charge.payment_intent]
      );
      break;
    }

    default:
      console.log(`Webhook event non géré : ${event.type}`);
  }

  return { received: true };
};


// ═══════════════════════════════════════════════════════════
// GET MY ORDERS
// ═══════════════════════════════════════════════════════════
export const getMyOrdersService = async (userId) => {
  const result = await database.query(
    `SELECT
       o.id, o.order_number, o.status, o.payment_method,
       o.payment_status, o.subtotal, o.discount_amount,
       o.total_price, o.shipping_city, o.created_at,
       d.status          AS delivery_status,
       d.tracking_number,
       d.carrier,
       d.estimated_date,
       COUNT(oi.id)      AS item_count
     FROM orders o
     LEFT JOIN deliveries  d  ON d.order_id  = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id, d.status, d.tracking_number, d.carrier, d.estimated_date
     ORDER BY o.created_at DESC`,
    [userId]
  );

  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════
export const getSingleOrderService = async ({ orderId, userId, role }) => {
  const condition = role === 'admin' ? "o.id=$1" : "o.id=$1 AND o.user_id=$2";
  const values    = role === 'admin' ? [orderId] : [orderId, userId];

  const [orderResult, itemsResult] = await Promise.all([
    database.query(
      `SELECT
         o.*,
         d.status          AS delivery_status,
         d.tracking_number,
         d.carrier,
         d.estimated_date,
         d.delivered_at,
         d.notes           AS delivery_notes
       FROM orders o
       LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE ${condition}`,
      values
    ),
    database.query(
      "SELECT * FROM order_items WHERE order_id=$1", [orderId]
    ),
  ]);

  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];
  order.items = itemsResult.rows;

  return order;
};


// ═══════════════════════════════════════════════════════════
// CANCEL ORDER
// ═══════════════════════════════════════════════════════════
export const cancelOrderService = async ({ orderId, userId, reason }) => {
  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, userId]
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];

  if (!['pending', 'confirmed'].includes(order.status))
    throw new ErrorHandler(
      `Impossible d'annuler une commande avec le statut '${order.status}'.`, 400
    );

  // Vérifier si stock géré par backend
  const settings = await database.query(
    "SELECT stock_managed_by FROM odoo_settings LIMIT 1"
  );
  const stockManagedBy = settings.rows[0]?.stock_managed_by || 'backend';

  // Restaurer le stock
  if (stockManagedBy === 'backend') {
    const items = await database.query(
      "SELECT * FROM order_items WHERE order_id=$1", [orderId]
    );
    await Promise.all(
      items.rows
        .filter(item => item.variant_id)
        .map(item =>
          database.query(
            "UPDATE product_variants SET stock = stock + $1 WHERE id=$2",
            [item.quantity, item.variant_id]
          )
        )
    );
  }

  // Rembourser Stripe si payé
  if (order.payment_status === 'paid' && order.payment_method === 'stripe' && order.payment_id) {
    await stripe.refunds.create({ payment_intent: order.payment_id });
  }

  // Mettre à jour statuts
  await Promise.all([
    database.query(
      "UPDATE orders SET status='cancelled', cancelled_reason=$1 WHERE id=$2",
      [reason || null, orderId]
    ),
    database.query(
      "UPDATE deliveries SET status='returned' WHERE order_id=$1", [orderId]
    ),
  ]);
};


// ═══════════════════════════════════════════════════════════
// GET ALL ORDERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllOrdersService = async ({ status, payment_status, page = 1 }) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (status)         { conditions.push(`o.status=$${index}`);         values.push(status);         index++; }
  if (payment_status) { conditions.push(`o.payment_status=$${index}`); values.push(payment_status); index++; }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);

  const [totalResult, result] = await Promise.all([
    database.query(`SELECT COUNT(*) FROM orders o ${whereClause}`, countValues),
    database.query(
      `SELECT
         o.id, o.order_number, o.status, o.payment_method,
         o.payment_status, o.total_price, o.created_at,
         u.name  AS customer_name,
         u.email AS customer_email,
         d.status          AS delivery_status,
         d.tracking_number,
         COUNT(oi.id)      AS item_count
       FROM orders o
       LEFT JOIN users       u  ON u.id  = o.user_id
       LEFT JOIN deliveries  d  ON d.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${whereClause}
       GROUP BY o.id, u.name, u.email, d.status, d.tracking_number
       ORDER BY o.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    ),
  ]);

  return {
    totalOrders: parseInt(totalResult.rows[0].count),
    totalPages:  Math.ceil(parseInt(totalResult.rows[0].count) / limit),
    page,
    orders:      result.rows,
  };
};


// ═══════════════════════════════════════════════════════════
// UPDATE ORDER STATUS (admin)
// ═══════════════════════════════════════════════════════════
export const updateOrderStatusService = async ({ orderId, status }) => {
  const validStatuses = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'];
  if (!validStatuses.includes(status))
    throw new ErrorHandler(`Statut invalide. Doit être : ${validStatuses.join(', ')}`, 400);

  const order = await database.query("SELECT * FROM orders WHERE id=$1", [orderId]);
  if (order.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  await database.query("UPDATE orders SET status=$1 WHERE id=$2", [status, orderId]);

  // Sync livraison automatiquement
  const deliveryStatusMap = {
    shipped:   "UPDATE deliveries SET status='shipped' WHERE order_id=$1",
    delivered: "UPDATE deliveries SET status='delivered', delivered_at=NOW() WHERE order_id=$1",
    cancelled: "UPDATE deliveries SET status='returned' WHERE order_id=$1",
  };

  if (deliveryStatusMap[status]) {
    await database.query(deliveryStatusMap[status], [orderId]);
  }

  return { message: `Statut mis à jour : ${status}` };
};


// ═══════════════════════════════════════════════════════════
// UPDATE DELIVERY (admin)
// ═══════════════════════════════════════════════════════════
export const updateDeliveryService = async ({
  orderId, carrier, tracking_number, estimated_date, status, notes
}) => {
  const delivery = await database.query(
    "SELECT * FROM deliveries WHERE order_id=$1", [orderId]
  );
  if (delivery.rows.length === 0)
    throw new ErrorHandler("Livraison introuvable.", 404);

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

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// GET LOW STOCK PRODUCTS (admin dashboard)
// ✅ Pour afficher dans le dashboard admin
// ═══════════════════════════════════════════════════════════
export const getLowStockProductsService = async () => {
  const result = await database.query(
    `SELECT
       p.id, p.name_fr, p.slug,
       pv.id    AS variant_id,
       pv.sku,
       pv.stock,
       pv.low_stock_threshold
     FROM product_variants pv
     LEFT JOIN products p ON p.id = pv.product_id
     WHERE pv.stock <= pv.low_stock_threshold
     AND   p.is_active = true
     AND   pv.is_active = true
     ORDER BY pv.stock ASC
     LIMIT 20`
  );

  return result.rows;
};