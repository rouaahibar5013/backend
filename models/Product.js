import database from "../database/db.js";

class Product {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM products WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par slug ─────────────────────────────────
  static async findBySlug(slug) {
    const result = await database.query(
      "SELECT * FROM products WHERE slug = $1 AND is_active = true",
      [slug]
    );
    return result.rows[0] || null;
  }

  // ─── Tous les produits actifs ─────────────────────────
  static async findAll({ page = 1, limit = 12, category_id = null, is_featured = null, is_new = null } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = ["p.is_active = true"];
    const values     = [];
    let   index      = 1;

    if (category_id) { conditions.push(`p.category_id = $${index}`); values.push(category_id); index++; }
    if (is_featured)  { conditions.push(`p.is_featured = $${index}`); values.push(is_featured);  index++; }
    if (is_new)       { conditions.push(`p.is_new = $${index}`);      values.push(is_new);       index++; }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    values.push(limit, offset);

    const result = await database.query(
      `SELECT p.*, c.name_fr AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    );
    return result.rows;
  }

  // ─── Recherche plein texte ────────────────────────────
  static async search(query, { page = 1, limit = 12 } = {}) {
    const offset = (page - 1) * limit;
    const result = await database.query(
      `SELECT p.*
       FROM products p
       WHERE p.is_active = true
         AND to_tsvector('french', p.name_fr || ' ' || COALESCE(p.description_fr, ''))
             @@ plainto_tsquery('french', $1)
       ORDER BY p.views_count DESC
       LIMIT $2 OFFSET $3`,
      [query, limit, offset]
    );
    return result.rows;
  }

  // ─── Créer un produit ─────────────────────────────────
  static async create(data) {
    const result = await database.query(
      `INSERT INTO products
         (name_fr, description_fr, slug, category_id, supplier_id, created_by,
          images, ethical_info_fr, origin, certifications,
          meta_title_fr, is_active, is_featured, is_new,
          usage_fr, ingredients_fr, precautions_fr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        data.name_fr, data.description_fr, data.slug,
        data.category_id || null, data.supplier_id || null, data.created_by || null,
        data.images || null, data.ethical_info_fr || null,
        data.origin || null, data.certifications || null,
        data.meta_title_fr || null,
        data.is_active ?? true, data.is_featured ?? false, data.is_new ?? false,
        data.usage_fr || null, data.ingredients_fr || null, data.precautions_fr || null,
      ]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour un produit ─────────────────────────
  static async update(id, data) {
    const result = await database.query(
      `UPDATE products
       SET name_fr        = COALESCE($1, name_fr),
           description_fr = COALESCE($2, description_fr),
           category_id    = COALESCE($3, category_id),
           supplier_id    = COALESCE($4, supplier_id),
           images         = COALESCE($5, images),
           is_active      = COALESCE($6, is_active),
           is_featured    = COALESCE($7, is_featured),
           is_new         = COALESCE($8, is_new),
           updated_at     = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        data.name_fr, data.description_fr,
        data.category_id, data.supplier_id,
        data.images, data.is_active,
        data.is_featured, data.is_new,
        id,
      ]
    );
    return result.rows[0];
  }

  // ─── Incrémenter les vues ─────────────────────────────
  static async incrementViews(id) {
    await database.query(
      "UPDATE products SET views_count = views_count + 1 WHERE id = $1",
      [id]
    );
  }

  // ─── Supprimer (soft delete) ──────────────────────────
  static async softDelete(id) {
    await database.query(
      "UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1",
      [id]
    );
  }
}

export default Product;