import database from "../database/db.js";

class Promotion {
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM promotion WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par code (vérification doublon création) ─
  static async findByCode(code) {
    const result = await database.query(
      "SELECT id FROM promotion WHERE UPPER(code) = UPPER($1)", [code]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par code en excluant un ID (update) ──────
  static async findByCodeExcludingId(code, excludeId) {
    const result = await database.query(
      "SELECT id FROM promotion WHERE UPPER(code) = UPPER($1) AND id != $2",
      [code, excludeId]
    );
    return result.rows[0] || null;
  }

  // ─── Valider un code promo (public) ──────────────────
  static async findValidByCode(code) {
    const result = await database.query(
      `SELECT
         id, code, description_fr,
         discount_type, discount_value, min_order_amount,
         expires_at, max_uses, used_count
       FROM promotion
       WHERE UPPER(code) = UPPER($1)
         AND is_active   = true
         AND starts_at  <= NOW()
         AND expires_at >= NOW()
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [code]
    );
    return result.rows[0] || null;
  }

  static async findAll({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const result = await database.query(
      "SELECT * FROM promotion ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return result.rows;
  }

  static async incrementUsed(id) {
    await database.query(
      "UPDATE promotion SET used_count = used_count + 1 WHERE id = $1", [id]
    );
  }

  static async create(data) {
    const result = await database.query(
      `INSERT INTO promotion
         (code, description_fr, discount_type, discount_value,
          min_order_amount, max_uses, is_active, starts_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        data.code.toUpperCase(), data.description_fr || null,
        data.discount_type, data.discount_value,
        data.min_order_amount || null, data.max_uses || null,
        data.is_active ?? true, data.starts_at || null, data.expires_at || null,
      ]
    );
    return result.rows[0];
  }

  // ─── Update complet ───────────────────────────────────
  static async updateFull(id, data) {
    const result = await database.query(
      `UPDATE promotion
       SET
         code             = COALESCE(UPPER($1), code),
         description_fr   = $2,
         discount_type    = COALESCE($3, discount_type),
         discount_value   = COALESCE($4, discount_value),
         min_order_amount = $5,
         starts_at        = COALESCE($6, starts_at),
         expires_at       = COALESCE($7, expires_at),
         max_uses         = $8,
         is_active        = COALESCE($9, is_active),
         updated_at       = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        data.code, data.description_fr, data.discount_type,
        data.discount_value, data.min_order_amount, data.starts_at,
        data.expires_at, data.max_uses, data.is_active, id,
      ]
    );
    return result.rows[0];
  }

  // ─── Update simple (existant) ─────────────────────────
  static async update(id, data) {
    const result = await database.query(
      `UPDATE promotion
       SET is_active  = COALESCE($1, is_active),
           expires_at = COALESCE($2, expires_at),
           max_uses   = COALESCE($3, max_uses),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [data.is_active, data.expires_at, data.max_uses, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await database.query("DELETE FROM promotion WHERE id = $1", [id]);
  }
}

export default Promotion;