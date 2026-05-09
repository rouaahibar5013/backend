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
      "SELECT * FROM categories WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  static async findBySlug(slug) {
    const result = await database.query(
      "SELECT * FROM categories WHERE slug = $1 AND is_active = true", [slug]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par nom (doublon) ────────────────────────
  static async findByName(name_fr) {
    const result = await database.query(
      "SELECT id FROM categories WHERE name_fr ILIKE $1", [name_fr]
    );
    return result.rows[0] || null;
  }

  // ─── Toutes les catégories avec comptage produits (arbre) ─
  static async findAllWithTree() {
    const result = await database.query(
      `SELECT
         c.id, c.name_fr, c.slug, c.description_fr,
         c.images, c.parent_id, c.sort_order, c.is_active,
         COUNT(DISTINCT p.id) AS product_count,
         par.name_fr          AS parent_name_fr,
         par.slug             AS parent_slug
       FROM categories c
       LEFT JOIN products   p   ON p.category_id = c.id AND p.is_active = true
       LEFT JOIN categories par ON par.id = c.parent_id
       WHERE c.is_active = true
       GROUP BY c.id, par.name_fr, par.slug
       ORDER BY c.sort_order ASC, c.name_fr ASC`
    );
    return result.rows.map(row => ({
      ...row,
      product_count: parseInt(row.product_count) || 0,
      images: typeof row.images === 'string' ? JSON.parse(row.images) : row.images ?? [],
    }));
  }

  // ─── Catégorie avec sous-catégories ──────────────────
  static async findByIdWithSubcategories(id) {
    const result = await database.query(
      `SELECT
         c.*,
         par.name_fr AS parent_name_fr,
         par.slug    AS parent_slug,
         COALESCE(
           json_agg(DISTINCT jsonb_build_object(
             'id',      sub.id,
             'name_fr', sub.name_fr,
             'slug',    sub.slug,
             'images',  sub.images
           )) FILTER (WHERE sub.id IS NOT NULL AND sub.is_active = true),
           '[]'
         ) AS subcategories
       FROM categories c
       LEFT JOIN categories par ON par.id        = c.parent_id
       LEFT JOIN categories sub ON sub.parent_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, par.name_fr, par.slug`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Générer un slug unique ───────────────────────────
  static async generateSlug(name_fr, excludeId = null) {
    const base = name_fr
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const query  = excludeId
      ? "SELECT id FROM categories WHERE slug = $1 AND id != $2"
      : "SELECT id FROM categories WHERE slug = $1";
    const params = excludeId ? [base, excludeId] : [base];

    const exists = await database.query(query, params);
    return exists.rows.length > 0 ? `${base}-${Date.now()}` : base;
  }

  // ─── Compter les produits liés ────────────────────────
  static async countProducts(categoryId) {
    const result = await database.query(
      "SELECT COUNT(*) FROM products WHERE category_id = $1", [categoryId]
    );
    return parseInt(result.rows[0].count);
  }

  // ─── Compter les sous-catégories ──────────────────────
  static async countChildren(categoryId) {
    const result = await database.query(
      "SELECT COUNT(*) FROM categories WHERE parent_id = $1", [categoryId]
    );
    return parseInt(result.rows[0].count);
  }

  // ─── Créer ────────────────────────────────────────────
  static async create({ name_fr, slug, description_fr, images, parent_id, sort_order = 0 }) {
    const result = await database.query(
      `INSERT INTO categories (name_fr, slug, description_fr, images, parent_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name_fr, slug, description_fr || null, images || null, parent_id || null, sort_order]
    );
    return result.rows[0];
  }

  // ─── Update complet ───────────────────────────────────
  static async updateFull(id, { name_fr, description_fr, parent_id, images, is_active, sort_order }) {
    const result = await database.query(
      `UPDATE categories SET
         name_fr        = $1,
         description_fr = $2,
         parent_id      = $3,
         images         = $4,
         is_active      = $5,
         sort_order     = $6,
         updated_at     = NOW()
       WHERE id = $7
       RETURNING *`,
      [name_fr, description_fr, parent_id, images, is_active, sort_order, id]
    );
    return result.rows[0];
  }

  // ─── Update simple (COALESCE) ─────────────────────────
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

  // ─── Supprimer ────────────────────────────────────────
  static async delete(id) {
    await database.query("DELETE FROM categories WHERE id = $1", [id]);
  }
}

export default Category;