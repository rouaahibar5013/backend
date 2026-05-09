import database from "../database/db.js";

class OrderItem {
  // ─── Articles d'une commande avec détails produit ─────
  static async findByOrderId(orderId) {
    const result = await database.query(
      `SELECT
         oi.id,
         oi.order_id,
         oi.variant_id,
         oi.quantity,
         oi.price_at_order,
         oi.created_at,
         p.name_fr           AS product_name_fr,
         p.images->0->>'url' AS product_image,
         pv.sku,
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name_fr,
               'attribute_value', pva.value_fr
             )
             ORDER BY at.name_fr
           ) FILTER (WHERE at.id IS NOT NULL),
           '[]'
         ) AS variant_details
       FROM order_item oi
       LEFT JOIN product_variant          pv  ON pv.id = oi.variant_id
       LEFT JOIN product                   p  ON p.id  = pv.product_id
       LEFT JOIN product_variant_attribute pva ON pva.variant_id = pv.id
       LEFT JOIN attribute_type            at  ON at.id = pva.attribute_type_id
       WHERE oi.order_id = $1
       GROUP BY oi.id, p.name_fr, p.images, pv.sku`,
      [orderId]
    );
    return result.rows;
  }

  // ─── Articles pour restauration du stock ─────────────
  static async findByOrderIdSimple(orderId) {
    const result = await database.query(
      `SELECT variant_id, quantity FROM order_item WHERE order_id = $1`,
      [orderId]
    );
    return result.rows;
  }

  // ─── Insérer un article ───────────────────────────────
  static async create({ orderId, variantId, quantity, priceAtOrder }) {
    const result = await database.query(
      `INSERT INTO order_item (order_id, variant_id, quantity, price_at_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orderId, variantId, quantity, priceAtOrder]
    );
    return result.rows[0];
  }
}

export default OrderItem;