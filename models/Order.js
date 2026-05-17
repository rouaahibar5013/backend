import database from "../database/db.js";

class Order {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      `SELECT o.*,
         pr.code           AS promo_code,
         pr.discount_type  AS promo_discount_type,
         pr.discount_value AS promo_discount_value,
         d.status          AS delivery_status,
         d.tracking_number,
         d.carrier,
         d.estimated_date,
         d.delivered_at,
         d.notes           AS delivery_notes
       FROM "order" o
       LEFT JOIN delivery   d  ON d.order_id = o.id
       LEFT JOIN promotion pr  ON pr.id = o.promo_id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par ID + user (sécurité client) ─────────
  static async findByIdAndUser(id, userId) {
    const result = await database.query(
      `SELECT o.*,
         pr.code           AS promo_code,
         d.status          AS delivery_status,
         d.tracking_number,
         d.carrier,
         d.estimated_date,
         d.delivered_at,
         d.notes           AS delivery_notes
       FROM "order" o
       LEFT JOIN delivery   d  ON d.order_id = o.id
       LEFT JOIN promotion pr  ON pr.id = o.promo_id
       WHERE o.id = $1 AND o.user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par payment_id (Stripe webhook) ─────────
  static async findByPaymentId(paymentId) {
    const result = await database.query(
      `SELECT * FROM "order" WHERE payment_id = $1`,
      [paymentId]
    );
    return result.rows[0] || null;
  }

  // ─── Toutes les commandes d'un user ──────────────────
  static async findByUser(userId) {
    const result = await database.query(
      `SELECT
         o.id, o.order_number, o.status, o.payment_method,
         o.payment_status, o.subtotal, o.discount_amount,
         o.shipping_cost, o.total_price,
         o.shipping_address, o.shipping_city, o.created_at,
         pr.code AS promo_code,
         d.status          AS delivery_status,
         d.tracking_number,
         d.carrier,
         d.estimated_date,
         COUNT(oi.id) AS item_count,
         COALESCE(
           json_agg(
             json_build_object(
               'id',             oi.id,
               'variant_id',     oi.variant_id,
               'product_name',   p.name_fr,
               'variant_details', (
                 SELECT COALESCE(
                   json_agg(json_build_object(
                     'attribute_type',  at2.name_fr,
                     'attribute_value', pva2.value_fr
                   )), '[]'
                 )
                 FROM product_variant_attribute pva2
                 JOIN attribute_type at2 ON at2.id = pva2.attribute_type_id
                 WHERE pva2.variant_id = oi.variant_id
               ),
               'quantity',      oi.quantity,
               'unit_price',    oi.price_at_order,
               'product_image', p.images->0->>'url'
             )
           ) FILTER (WHERE oi.id IS NOT NULL), '[]'
         ) AS items
       FROM "order" o
       LEFT JOIN delivery        d   ON d.order_id  = o.id
       LEFT JOIN order_item      oi  ON oi.order_id = o.id
       LEFT JOIN product_variant pv  ON pv.id       = oi.variant_id
       LEFT JOIN product         p   ON p.id        = pv.product_id
       LEFT JOIN promotion       pr  ON pr.id       = o.promo_id
       WHERE o.user_id = $1
       GROUP BY o.id, d.status, d.tracking_number, d.carrier, d.estimated_date, pr.code
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  // ─── Toutes les commandes (admin) ────────────────────
  static async findAll({ status, payment_status, page = 1, limit = 10 } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = [];
    const values     = [];
    let   index      = 1;

    if (status)         { conditions.push(`o.status = $${index}`);         values.push(status);         index++; }
    if (payment_status) { conditions.push(`o.payment_status = $${index}`); values.push(payment_status); index++; }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countValues = [...values];
    values.push(limit, offset);

    const [totalResult, result] = await Promise.all([
      database.query(`SELECT COUNT(*) FROM "order" o ${whereClause}`, countValues),
      database.query(
        `SELECT
           o.id, o.order_number, o.status, o.payment_method,
           o.payment_status, o.total_price, o.shipping_cost, o.created_at,
           u.name           AS customer_name,
           u.email          AS customer_email,
           pr.code          AS promo_code,
           d.status         AS delivery_status,
           d.tracking_number,
           COUNT(oi.id)     AS item_count
         FROM "order" o
         LEFT JOIN "user"    u   ON u.id       = o.user_id
         LEFT JOIN delivery  d   ON d.order_id = o.id
         LEFT JOIN order_item oi ON oi.order_id = o.id
         LEFT JOIN promotion  pr ON pr.id       = o.promo_id
         ${whereClause}
         GROUP BY o.id, u.name, u.email, d.status, d.tracking_number, pr.code
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
  }

  // ─── Créer une commande ───────────────────────────────
  static async create({
    userId, payment_method,
    subtotal, shippingCost, discountAmount, totalPrice,
    promoId,
    billing_full_name, billing_phone,
    billing_address, billing_city,
    billing_governorate, billing_postal_code, billing_country,
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
    notes,
  }) {
    const result = await database.query(
      `INSERT INTO "order" (
         user_id, status, payment_method, payment_status,
         subtotal, shipping_cost, discount_amount, total_price,
         promo_id,
         billing_full_name,   billing_phone,
         billing_address,     billing_city,
         billing_governorate, billing_postal_code, billing_country,
         shipping_full_name,  shipping_phone,
         shipping_address,    shipping_city,
         shipping_governorate, shipping_postal_code, shipping_country,
         notes
       ) VALUES (
         $1, 'en_attente', $2, 'en_attente',
         $3, $4, $5, $6, $7,
         $8,  $9,
         $10, $11,
         $12, $13, $14,
         $15, $16,
         $17, $18,
         $19, $20, $21,
         $22
       ) RETURNING *`,
      [
        userId,        payment_method,
        subtotal,      shippingCost,   discountAmount, totalPrice,
        promoId || null,
        billing_full_name    || null, billing_phone       || null,
        billing_address      || null, billing_city        || null,
        billing_governorate  || null, billing_postal_code || null,
        billing_country      || "CH",
        shipping_full_name,            shipping_phone      || null,
        shipping_address,              shipping_city,
        shipping_governorate || null,  shipping_postal_code || null,
        shipping_country     || "CH",
        notes || null,
      ]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour le statut ──────────────────────────
  static async updateStatus(id, status) {
    await database.query(
      `UPDATE "order" SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
  }

  // ─── Mettre à jour le payment_id ─────────────────────
  static async updatePaymentId(id, paymentId) {
    await database.query(
      `UPDATE "order" SET payment_id = $1 WHERE id = $2`,
      [paymentId, id]
    );
  }

  // ─── Confirmer le paiement (webhook Stripe) ───────────
  static async confirmPayment(paymentId) {
    const result = await database.query(
      `UPDATE "order"
       SET payment_status = 'paye', status = 'confirmee', updated_at = NOW()
       WHERE payment_id = $1
       RETURNING *`,
      [paymentId]
    );
    return result.rows[0] || null;
  }

  // ─── Marquer paiement échoué (webhook Stripe) ─────────
  static async markPaymentFailed(paymentId) {
    const result = await database.query(
      `UPDATE "order"
       SET payment_status = 'echoue', status = 'annulee',
           cancelled_reason = 'Paiement échoué', updated_at = NOW()
       WHERE payment_id = $1
       RETURNING *`,
      [paymentId]
    );
    return result.rows[0] || null;
  }

  // ─── Marquer remboursé (webhook Stripe) ───────────────
  static async markRefunded(paymentId) {
    const result = await database.query(
      `UPDATE "order" SET payment_status = 'rembourse', status = 'remboursee', updated_at = NOW() WHERE payment_id = $1 RETURNING *`,
      [paymentId]
    );
    return result.rows[0] || null;
  }


  // ─── Annuler une commande ─────────────────────────────
  static async cancel(id, reason) {
    await database.query(
      `UPDATE "order"
       SET status = 'annulee', cancelled_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, id]
    );
  }

  // ✅ NOUVEAU — Ajouter après cancel()
static async markReturned(orderId) {
  const result = await database.query(
    `UPDATE "order"
     SET status     = 'retournee',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId]
  );
  return result.rows[0] || null;
}

  // ─── Mettre à jour infos livraison (admin) ────────────
  static async updateShipping(id, {
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
  }) {
    const result = await database.query(
      `UPDATE "order"
       SET shipping_full_name   = $1,
           shipping_phone       = $2,
           shipping_address     = $3,
           shipping_city        = $4,
           shipping_governorate = $5,
           shipping_postal_code = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        shipping_full_name, shipping_phone,
        shipping_address, shipping_city,
        shipping_governorate, shipping_postal_code,
        id,
      ]
    );
    return result.rows[0];
  }

  static async findEligibleForReclamation(userId) {
    const result = await database.query(
      `SELECT
         o.id, o.order_number, o.status, o.total_price, o.created_at,
         COUNT(oi.id) AS item_count
       FROM "order" o
       LEFT JOIN order_item oi ON oi.order_id = o.id
       WHERE o.user_id        = $1
         AND o.payment_status = 'paye'
         AND o.status IN ('confirmee', 'en_preparation', 'expediee', 'livree')
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async findByOrderNumber(orderNumber) {
    const result = await database.query(
      `SELECT * FROM "order" WHERE order_number = $1`,
      [orderNumber]
    );
    return result.rows[0] || null;
  }
}

export default Order;