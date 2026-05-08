import database from "../database/db.js";

class Promotion {
  static async findByCode(code) {
    const result = await database.query(
      `SELECT * FROM promotions
       WHERE UPPER(code) = UPPER($1)
         AND is_active   = true
         AND starts_at  <= NOW()
         AND expires_at >= NOW()
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [code]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM promotions WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async findAll({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const result = await database.query(
      "SELECT * FROM promotions ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return result.rows;
  }

  static async incrementUsed(id) {
    await database.query(
      "UPDATE promotions SET used_count = used_count + 1 WHERE id = $1",
      [id]
    );
  }

  static async create(data) {
    const result = await database.query(
      `INSERT INTO promotions
         (code, description_fr, discount_type, discount_value,
          min_order_amount, max_uses, is_active, starts_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        data.code.toUpperCase(), data.description_fr || null,
        data.discount_type, data.discount_value,
        data.min_order_amount || 0, data.max_uses || null,
        data.is_active ?? true, data.starts_at || null, data.expires_at || null,
      ]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const result = await database.query(
      `UPDATE promotions
       SET is_active    = COALESCE($1, is_active),
           expires_at   = COALESCE($2, expires_at),
           max_uses     = COALESCE($3, max_uses),
           updated_at   = NOW()
       WHERE id = $4
       RETURNING *`,
      [data.is_active, data.expires_at, data.max_uses, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await database.query("DELETE FROM promotions WHERE id = $1", [id]);
  }
}

export default Promotion;