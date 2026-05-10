import database from "../database/db.js";

class Supplier {
  static async findAll({ activeOnly = true } = {}) {
    const where = activeOnly ? "WHERE is_active = true" : "";
    const result = await database.query(
      `SELECT * FROM supplier ${where} ORDER BY name ASC`
    );
    return result.rows;
  }

  // ─── Tous les fournisseurs avec nombre de produits ───
  static async findAllWithProductCount() {
    const result = await database.query(
      `SELECT
         s.id, s.name, s.slug,
         s.description_fr,
         s.region, s.address, s.contact,
         s.email, s.website, s.logo_url,
         s.is_certified_bio, s.is_active,
         COUNT(DISTINCT p.id) AS product_count
       FROM supplier s
       LEFT JOIN product p ON p.supplier_id = s.id AND p.is_active = true
       WHERE s.is_active = true
       GROUP BY s.id
       ORDER BY s.name ASC`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM supplier WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  static async findBySlug(slug) {
    const result = await database.query(
      "SELECT * FROM supplier WHERE slug = $1 AND is_active = true", [slug]
    );
    return result.rows[0] || null;
  }

  // ─── Fournisseur par slug avec ses produits ───────────
  static async findBySlugWithProducts(slug) {
    const supplierResult = await database.query(
      `SELECT s.*, COUNT(DISTINCT p.id) AS product_count
       FROM supplier s
       LEFT JOIN product p ON p.supplier_id = s.id AND p.is_active = true
       WHERE s.slug = $1
       GROUP BY s.id`,
      [slug]
    );
    if (supplierResult.rows.length === 0) return null;

    const supplier = supplierResult.rows[0];

    const productsResult = await database.query(
      `SELECT
         p.id, p.name_fr, p.slug,
         p.images, p.rating_avg, p.rating_count, p.is_featured,
         (SELECT MIN(pv.price) FROM product_variant pv
          WHERE pv.product_id = p.id) AS min_price,
         (SELECT COALESCE(SUM(pv.stock), 0) FROM product_variant pv
          WHERE pv.product_id = p.id) AS total_stock,
         c.name_fr AS category_name,
         c.slug    AS category_slug
       FROM product p
       LEFT JOIN category c ON c.id = p.category_id
       WHERE p.supplier_id = $1 AND p.is_active = true
       ORDER BY p.created_at DESC`,
      [supplier.id]
    );

    supplier.products = productsResult.rows;
    return supplier;
  }

  // ─── Trouver par nom (insensible à la casse) ──────────
  static async findByName(name) {
    const result = await database.query(
      "SELECT id FROM supplier WHERE name ILIKE $1", [name]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par nom en excluant un ID ────────────────
  static async findByNameExcludingId(name, excludeId) {
    const result = await database.query(
      "SELECT id FROM supplier WHERE name ILIKE $1 AND id != $2",
      [name, excludeId]
    );
    return result.rows[0] || null;
  }

  // ─── Vérifier slug en excluant un ID ─────────────────
  static async findBySlugExcludingId(slug, excludeId = null) {
    const query  = excludeId
      ? "SELECT id FROM supplier WHERE slug = $1 AND id != $2"
      : "SELECT id FROM supplier WHERE slug = $1";
    const params = excludeId ? [slug, excludeId] : [slug];
    const result = await database.query(query, params);
    return result.rows[0] || null;
  }

  static async create(data) {
    const result = await database.query(
      `INSERT INTO supplier
         (name, slug, description_fr, region, address, contact,
          email, website, logo_url, is_certified_bio, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.name, data.slug, data.description_fr || null,
        data.region || null, data.address || null, data.contact || null,
        data.email || null, data.website || null, data.logo_url || null,
        data.is_certified_bio ?? false, data.is_active ?? true,
      ]
    );
    return result.rows[0];
  }

  // ─── Update complet ───────────────────────────────────
  static async updateFull(id, data) {
    const result = await database.query(
      `UPDATE supplier SET
         name             = $1,
         description_fr   = $2,
         region           = $3,
         address          = $4,
         contact          = $5,
         email            = $6,
         website          = $7,
         is_certified_bio = $8,
         is_active        = $9,
         logo_url         = $10,
         updated_at       = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        data.name, data.description_fr, data.region,
        data.address, data.contact, data.email, data.website,
        data.is_certified_bio, data.is_active, data.logo_url, id,
      ]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const result = await database.query(
      `UPDATE supplier
       SET name             = COALESCE($1, name),
           description_fr   = COALESCE($2, description_fr),
           region           = COALESCE($3, region),
           is_certified_bio = COALESCE($4, is_certified_bio),
           is_active        = COALESCE($5, is_active),
           logo_url         = COALESCE($6, logo_url),
           updated_at       = NOW()
       WHERE id = $7
       RETURNING *`,
      [data.name, data.description_fr, data.region, data.is_certified_bio, data.is_active, data.logo_url, id]
    );
    return result.rows[0];
  }

  // ─── Détacher les produits avant suppression ──────────
  static async unlinkProducts(supplierId) {
    await database.query(
      "UPDATE product SET supplier_id = NULL WHERE supplier_id = $1",
      [supplierId]
    );
  }

  static async delete(id) {
    await database.query("DELETE FROM supplier WHERE id = $1", [id]);
  }
}

export default Supplier;