import database from "../database/db.js";

class ProductVariant {
  static async findById(id) {
    const result = await database.query(
      `SELECT
         pv.id, pv.price, pv.stock, pv.low_stock_threshold,
         pv.sku, pv.is_active, pv.cost_price, pv.weight_grams,
         p.name_fr AS product_name_fr, p.is_active AS product_is_active
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findActiveById(id) {
    const result = await database.query(
      `SELECT
         pv.id, pv.price, pv.stock, pv.low_stock_threshold, pv.sku, pv.is_active,
         p.name_fr AS product_name_fr
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1 AND pv.is_active = true AND p.is_active = true`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ✅ NOUVEAU — batch pour calculateOrderItems (fix N+1)
  // Remplace N appels à findActiveById par 1 seule requête
  static async findActiveByIds(ids) {
    const result = await database.query(
      `SELECT
         pv.id, pv.price, pv.stock, pv.low_stock_threshold, pv.sku, pv.is_active,
         p.name_fr AS product_name_fr
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ANY($1)
         AND pv.is_active = true
         AND p.is_active  = true`,
      [ids]
    );
    return result.rows;
  }

  static async findByProductId(productId) {
    const result = await database.query(
      `SELECT
         pv.*,
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name_fr,
               'attribute_value', pva.value_fr
             ) ORDER BY at.name_fr
           ) FILTER (WHERE at.id IS NOT NULL),
           '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN product_variant_attributes pva ON pva.variant_id = pv.id
       LEFT JOIN attribute_types             at  ON at.id = pva.attribute_type_id
       WHERE pv.product_id = $1 AND pv.is_active = true
       GROUP BY pv.id
       ORDER BY pv.price ASC`,
      [productId]
    );
    return result.rows;
  }

  static async findLowStock() {
    const result = await database.query(
      `SELECT
         p.id, p.name_fr, p.slug,
         pv.id AS variant_id, pv.sku, pv.stock, pv.low_stock_threshold
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE pv.stock    <= pv.low_stock_threshold
         AND p.is_active  = true
         AND pv.is_active = true
       ORDER BY pv.stock ASC
       LIMIT 20`
    );
    return result.rows;
  }

  static async decrementStock(id, quantity) {
    await database.query(
      "UPDATE product_variants SET stock = GREATEST(stock - $1, 0) WHERE id = $2",
      [quantity, id]
    );
  }

  static async incrementStock(id, quantity) {
    await database.query(
      "UPDATE product_variants SET stock = stock + $1 WHERE id = $2",
      [quantity, id]
    );
  }

  static async create({ product_id, sku, price, cost_price, stock, low_stock_threshold, weight_grams, barcode }) {
    const result = await database.query(
      `INSERT INTO product_variants
         (product_id, sku, price, cost_price, stock, low_stock_threshold, weight_grams, barcode, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING *`,
      [product_id, sku || null, price, cost_price || null, stock || 0, low_stock_threshold || 5, weight_grams || null, barcode || null]
    );
    return result.rows[0];
  }

  static async updateFull(id, { price, cost_price, stock, sku, low_stock_threshold, weight_grams, is_active }) {
    const result = await database.query(
      `UPDATE product_variants SET
         price=$1, cost_price=$2, stock=$3, sku=$4,
         low_stock_threshold=$5, weight_grams=$6, is_active=$7,
         updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [price, cost_price, stock, sku, low_stock_threshold, weight_grams, is_active, id]
    );
    return result.rows[0];
  }

  static async update(id, { price, stock, cost_price, low_stock_threshold, is_active }) {
    const result = await database.query(
      `UPDATE product_variants
       SET price               = COALESCE($1, price),
           stock               = COALESCE($2, stock),
           cost_price          = COALESCE($3, cost_price),
           low_stock_threshold = COALESCE($4, low_stock_threshold),
           is_active           = COALESCE($5, is_active),
           updated_at          = NOW()
       WHERE id = $6
       RETURNING *`,
      [price, stock, cost_price, low_stock_threshold, is_active, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await database.query("DELETE FROM product_variants WHERE id = $1", [id]);
  }
}

export default ProductVariant;