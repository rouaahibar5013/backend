import database from "../database/db.js";

class VariantPromotion {
  static async findActiveByVariantId(variantId) {
    const result = await database.query(
      `SELECT discount_type, discount_value
       FROM variant_promotion
       WHERE variant_id = $1
         AND is_active  = true
         AND starts_at <= NOW()
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [variantId]
    );
    return result.rows[0] || null;
  }

  // ✅ NOUVEAU — batch pour calculateOrderItems (fix N+1)
  // Remplace N appels à findActiveByVariantId par 1 seule requête
  static async findActiveByVariantIds(variantIds) {
    const result = await database.query(
      `SELECT DISTINCT ON (variant_id)
         variant_id, discount_type, discount_value
       FROM variant_promotion
       WHERE variant_id = ANY($1)
         AND is_active  = true
         AND starts_at <= NOW()
         AND expires_at > NOW()
       ORDER BY variant_id, created_at DESC`,
      [variantIds]
    );
    return result.rows;
  }

  static async findByVariantId(variantId) {
    const result = await database.query(
      "SELECT * FROM variant_promotion WHERE variant_id = $1 ORDER BY created_at DESC",
      [variantId]
    );
    return result.rows;
  }

  static async create({ variant_id, discount_type, discount_value, starts_at, expires_at }) {
    const result = await database.query(
      `INSERT INTO variant_promotion (variant_id, discount_type, discount_value, starts_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [variant_id, discount_type, discount_value, starts_at || new Date(), expires_at]
    );
    return result.rows[0];
  }

  static async deactivateAllByVariantId(variantId) {
    await database.query(
      "UPDATE variant_promotion SET is_active = false, updated_at = NOW() WHERE variant_id = $1 AND is_active = true",
      [variantId]
    );
  }

  static async toggle(id, is_active) {
    const result = await database.query(
      "UPDATE variant_promotion SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [is_active, id]
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    const result = await database.query(
      "DELETE FROM variant_promotion WHERE id = $1 RETURNING id",
      [id]
    );
    return result.rows[0] || null;
  }
}

export default VariantPromotion;