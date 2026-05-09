import database from "../database/db.js";

class Recipe {
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM recipes WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  static async findBySlug(slug) {
    const result = await database.query(
      "SELECT * FROM recipes WHERE slug = $1", [slug]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par slug (public uniquement) ────────────
  static async findBySlugPublic(slug) {
    const result = await database.query(
      "SELECT * FROM recipes WHERE slug = $1 AND is_published = true", [slug]
    );
    return result.rows[0] || null;
  }

  // ─── Toutes les recettes publiées avec filtres ────────
  static async findAllPublic({ category, difficulty, search, page = 1, limit = 9 } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = ["r.is_published = true"];
    const values     = [];
    let   index      = 1;

    if (category)   { conditions.push(`r.category   = $${index}`); values.push(category);        index++; }
    if (difficulty) { conditions.push(`r.difficulty = $${index}`); values.push(difficulty);       index++; }
    if (search)     { conditions.push(`r.title_fr ILIKE $${index}`); values.push(`%${search}%`); index++; }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const countValues = [...values];
    values.push(limit, offset);

    const [totalResult, result] = await Promise.all([
      database.query(`SELECT COUNT(*) FROM recipes r ${whereClause}`, countValues),
      database.query(
        `SELECT
           r.id, r.title_fr, r.slug,
           r.description_fr, r.cover_image,
           r.prep_time, r.cook_time, r.servings,
           r.difficulty, r.category,
           r.is_featured, r.views_count, r.created_at,
           (SELECT COUNT(*) FROM recipe_ingredients ri
            WHERE ri.recipe_id = r.id) AS ingredients_count
         FROM recipes r
         ${whereClause}
         ORDER BY r.is_featured DESC, r.created_at DESC
         LIMIT $${index} OFFSET $${index + 1}`,
        values
      ),
    ]);

    return {
      totalRecipes: parseInt(totalResult.rows[0].count),
      totalPages:   Math.ceil(parseInt(totalResult.rows[0].count) / limit),
      page,
      recipes:      result.rows,
    };
  }

  // ─── Recettes mises en avant ──────────────────────────
  static async findFeatured() {
    const result = await database.query(
      `SELECT
         id, title_fr, slug, cover_image,
         prep_time, cook_time, difficulty, category,
         views_count, created_at,
         (SELECT COUNT(*) FROM recipe_ingredients ri
          WHERE ri.recipe_id = recipes.id) AS ingredients_count
       FROM recipes
       WHERE is_published = true AND is_featured = true
       ORDER BY created_at DESC
       LIMIT 6`
    );
    return result.rows;
  }

  // ─── Toutes les recettes (admin) ──────────────────────
  static async findAllAdmin() {
    const result = await database.query(
      `SELECT
         r.id, r.title_fr, r.slug, r.category,
         r.difficulty, r.is_published, r.is_featured,
         r.views_count, r.created_at,
         (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredients_count,
         (SELECT COUNT(*) FROM recipe_steps       rs WHERE rs.recipe_id = r.id) AS steps_count
       FROM recipes r
       ORDER BY r.created_at DESC`
    );
    return result.rows;
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

  // ─── Update complet ───────────────────────────────────
  static async updateFull(id, data) {
    const result = await database.query(
      `UPDATE recipes
       SET title_fr       = $1,  description_fr = $2,
           cover_image    = $3,  prep_time      = $4,
           cook_time      = $5,  servings       = $6,
           difficulty     = $7,  category       = $8,
           is_published   = $9,  is_featured    = $10,
           updated_at     = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        data.title_fr, data.description_fr, data.cover_image,
        data.prep_time, data.cook_time, data.servings,
        data.difficulty, data.category,
        data.is_published, data.is_featured, id,
      ]
    );
    return result.rows[0];
  }

  // ─── Update simple (COALESCE) ─────────────────────────
  static async update(id, data) {
    const result = await database.query(
      `UPDATE recipes
       SET title_fr       = COALESCE($1, title_fr),
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
      "UPDATE recipes SET views_count = views_count + 1 WHERE id = $1", [id]
    );
  }

  static async delete(id) {
    await database.query("DELETE FROM recipes WHERE id = $1", [id]);
  }
}

export default Recipe;