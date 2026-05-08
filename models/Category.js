import database from "../database/db.js";

class Category {
  static async findAll({ activeOnly = true } = {}) {
    const where = activeOnly ? "WHERE is_active = true" : "";
    const result = await database.query(
      `SELECT * FROM categories ${where} ORDER BY sort_order ASC, name_fr ASC`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM categories WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async findBySlug(slug) {
    const result = await database.query(
      "SELECT * FROM categories WHERE slug = $1 AND is_active = true",
      [slug]
    );
    return result.rows[0] || null;
  }

  static async create({ name_fr, slug, description_fr, images, parent_id, sort_order }) {
    const result = await database.query(
      `INSERT INTO categories (name_fr, slug, description_fr, images, parent_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name_fr, slug, description_fr || null, images || null, parent_id || null, sort_order || 0]
    );
    return result.rows[0];
  }

  static async update(id, { name_fr, slug, description_fr, images, is_active, sort_order }) {
    const result = await database.query(
      `UPDATE categories
       SET name_fr        = COALESCE($1, name_fr),
           slug           = COALESCE($2, slug),
           description_fr = COALESCE($3, description_fr),
           images         = COALESCE($4, images),
           is_active      = COALESCE($5, is_active),
           sort_order     = COALESCE($6, sort_order),
           updated_at     = NOW()
       WHERE id = $7
       RETURNING *`,
      [name_fr, slug, description_fr, images, is_active, sort_order, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await database.query("DELETE FROM categories WHERE id = $1", [id]);
  }
}

export default Category;