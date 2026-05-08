import database from "../database/db.js";

class Recipe {
  static async findAll({ publishedOnly = true, page = 1, limit = 12 } = {}) {
    const offset = (page - 1) * limit;
    const where  = publishedOnly ? "WHERE is_published = true" : "";
    const result = await database.query(
      `SELECT * FROM recipes ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async findBySlug(slug) {
    const result = await database.query(
      `SELECT r.*,
         json_agg(DISTINCT jsonb_build_object(
           'id', rs.id, 'step_number', rs.step_number,
           'instruction_fr', rs.instruction_fr, 'image', rs.image, 'duration', rs.duration
         ) ORDER BY rs.step_number) FILTER (WHERE rs.id IS NOT NULL) AS steps,
         json_agg(DISTINCT jsonb_build_object(
           'id', ri.id, 'name_fr', ri.name_fr,
           'quantity', ri.quantity, 'is_bio', ri.is_bio, 'sort_order', ri.sort_order
         ) ORDER BY ri.sort_order) FILTER (WHERE ri.id IS NOT NULL) AS ingredients
       FROM recipes r
       LEFT JOIN recipe_steps       rs ON rs.recipe_id = r.id
       LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       WHERE r.slug = $1
       GROUP BY r.id`,
      [slug]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM recipes WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(data) {
    const result = await database.query(
      `INSERT INTO recipes
         (title_fr, slug, description_fr, cover_image, prep_time,
          cook_time, servings, difficulty, category, is_published, is_featured, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        data.title_fr, data.slug, data.description_fr || null, data.cover_image || null,
        data.prep_time || null, data.cook_time || null, data.servings || 4,
        data.difficulty || "facile", data.category || null,
        data.is_published ?? false, data.is_featured ?? false, data.created_by || null,
      ]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const result = await database.query(
      `UPDATE recipes
       SET title_fr      = COALESCE($1, title_fr),
           description_fr = COALESCE($2, description_fr),
           is_published   = COALESCE($3, is_published),
           is_featured    = COALESCE($4, is_featured),
           updated_at     = NOW()
       WHERE id = $5
       RETURNING *`,
      [data.title_fr, data.description_fr, data.is_published, data.is_featured, id]
    );
    return result.rows[0];
  }

  static async incrementViews(id) {
    await database.query(
      "UPDATE recipes SET views_count = views_count + 1 WHERE id = $1",
      [id]
    );
  }

  static async delete(id) {
    await database.query("DELETE FROM recipes WHERE id = $1", [id]);
  }
}

export default Recipe;