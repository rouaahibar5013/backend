import database from "../database/db.js";

class Product {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM product WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par slug ─────────────────────────────────
  static async findBySlug(slug) {
    const result = await database.query(
      "SELECT * FROM product WHERE slug = $1 AND is_active = true", [slug]
    );
    return result.rows[0] || null;
  }

  // ─── Tous les produits (simple) ───────────────────────
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
       FROM product p
       LEFT JOIN category c ON c.id = p.category_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    );
    return result.rows;
  }

  // ─── Tous les produits avec filtres (listing public/admin) ─
  static async findAllWithFilters({
    search, category_id, min_rating, min_price, max_price, page = 1,
    is_featured, supplier_id, admin = false, is_active,
  }) {
    const LIMIT  = admin === "true" ? 500 : 12;
    const offset = admin === "true" ? 0 : (page - 1) * LIMIT;

    const conditions = admin === "true" ? [] : ["p.is_active = true"];
    const values     = [];
    let   i          = 1;

    if (admin === "true" && is_active !== undefined) {
      conditions.push(`p.is_active = $${i}`);
      values.push(is_active === "true" || is_active === true); i++;
    }
    if (category_id) {
      conditions.push(`(p.category_id = $${i} OR c.parent_id = $${i})`);
      values.push(category_id); i++;
    }
    if (min_rating) {
      conditions.push(`p.rating_avg >= $${i}`);
      values.push(min_rating); i++;
    }
    if (is_featured) conditions.push("p.is_featured = true");
    if (supplier_id) {
      conditions.push(`p.supplier_id = $${i}`);
      values.push(supplier_id); i++;
    }
    if (search) {
      conditions.push(`(p.name_fr ILIKE $${i} OR p.description_fr ILIKE $${i})`);
      values.push(`%${search}%`); i++;
    }

    const promoSubquery = `(SELECT MIN(
        CASE
          WHEN vp.discount_type = 'percent' THEN pv2.price * (1 - vp.discount_value / 100)
          WHEN vp.discount_type = 'fixed'   THEN GREATEST(0, pv2.price - vp.discount_value)
          ELSE pv2.price
        END
      )
      FROM product_variant pv2
      LEFT JOIN LATERAL (
        SELECT discount_type, discount_value
        FROM variant_promotion vp2
        WHERE vp2.variant_id = pv2.id
          AND vp2.is_active = true
          AND vp2.starts_at <= NOW()
          AND vp2.expires_at > NOW()
        ORDER BY vp2.created_at DESC LIMIT 1
      ) vp ON true
      WHERE pv2.product_id = p.id AND pv2.is_active = true)`;

    if (min_price) { conditions.push(`${promoSubquery} >= $${i}`); values.push(min_price); i++; }
    if (max_price) { conditions.push(`${promoSubquery} <= $${i}`); values.push(max_price); i++; }

    const WHERE       = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countValues = [...values];
    values.push(LIMIT, offset);

    const [totalResult, result] = await Promise.all([
      database.query(
        `SELECT COUNT(DISTINCT p.id) FROM product p LEFT JOIN category c ON c.id = p.category_id ${WHERE}`,
        countValues
      ),
      database.query(
        `SELECT DISTINCT ON (p.id)
           p.id, p.name_fr, p.slug, p.images,
           (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM review r WHERE r.product_id = p.id) AS rating_avg,
           (SELECT COUNT(*) FROM review r WHERE r.product_id = p.id)::int AS rating_count,
           p.is_featured, p.is_active, p.is_new, p.created_at,
           c.id      AS category_id, c.name_fr AS category_name, c.slug AS category_slug,
           s.id      AS supplier_id, s.name AS supplier_name, s.slug AS supplier_slug, s.is_certified_bio,
           ${promoSubquery} AS min_price,
           (SELECT pv2.id FROM product_variant pv2
            WHERE pv2.product_id = p.id AND pv2.is_active = true
            ORDER BY pv2.price ASC LIMIT 1) AS cheapest_variant_id,
           (SELECT COALESCE(SUM(pv2.stock), 0) FROM product_variant pv2
            WHERE pv2.product_id = p.id AND pv2.is_active = true) AS total_stock,
           (SELECT MIN(pv2.price) FROM product_variant pv2
            WHERE pv2.product_id = p.id AND pv2.is_active = true) AS original_min_price
         FROM product p
         LEFT JOIN category c ON c.id = p.category_id
         LEFT JOIN supplier  s ON s.id = p.supplier_id
         ${WHERE}
         ORDER BY p.id, p.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        values
      ),
    ]);

    const total = parseInt(totalResult.rows[0].count);
    return { totalProducts: total, totalPages: Math.ceil(total / LIMIT), page, products: result.rows };
  }

  // ─── Produit détaillé (page produit) ──────────────────
  static async findWithDetails(productId, admin = false) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    const col    = isUuid ? "id" : "slug";

    const [productResult, variantsResult] = await Promise.all([
      database.query(
        `SELECT
           p.*,
           c.id              AS category_id,
           c.name_fr         AS category_name,
           c.slug            AS category_slug,
           pc.name_fr        AS parent_category_name,
           pc.slug           AS parent_category_slug,
           s.name            AS supplier_name,
           s.slug            AS supplier_slug,
           s.description_fr  AS supplier_description,
           s.region          AS supplier_region,
           s.is_certified_bio,
           COALESCE(
             json_agg(
               json_build_object(
                 'review_id',  r.id,
                 'rating',     r.rating,
                 'comment',    r.comment,
                 'created_at', r.created_at,
                 'updated_at', r.updated_at,
                 'reviewer', json_build_object(
                   'id', u.id, 'name', u.name, 'avatar', u.avatar
                 )
               )
               ORDER BY r.created_at DESC
             ) FILTER (WHERE r.id IS NOT NULL),
             '[]'
           ) AS reviews
         FROM product p
         LEFT JOIN category c  ON c.id  = p.category_id
         LEFT JOIN category pc ON pc.id = c.parent_id
         LEFT JOIN supplier  s  ON s.id  = p.supplier_id
         LEFT JOIN review     r  ON r.product_id = p.id
         LEFT JOIN "user"      u  ON u.id  = r.user_id
         WHERE p.${col} = $1 ${admin ? "" : "AND p.is_active = true"}
         GROUP BY p.id, c.id, c.name_fr, c.slug,
                  pc.name_fr, pc.slug,
                  s.name, s.slug, s.description_fr,
                  s.region, s.is_certified_bio`,
        [productId]
      ),
      database.query(
        `SELECT
           pv.*,
           active_promo.discount_type  AS promo_type,
           active_promo.discount_value AS promo_value,
           active_promo.expires_at     AS promo_expires_at,
           COALESCE(
             json_agg(
               json_build_object('type_fr', at.name_fr, 'value_fr', pva.value_fr)
               ORDER BY at.name_fr
             ) FILTER (WHERE at.id IS NOT NULL),
             '[]'
           ) AS attributes
         FROM product_variant pv
         LEFT JOIN product_variant_attribute pva ON pva.variant_id = pv.id
         LEFT JOIN attribute_type           at  ON at.id = pva.attribute_type_id
         LEFT JOIN LATERAL (
           SELECT discount_type, discount_value, expires_at
           FROM variant_promotion vp
           WHERE vp.variant_id = pv.id
             AND vp.is_active  = true
             AND vp.starts_at <= NOW()
             AND vp.expires_at > NOW()
           ORDER BY vp.created_at DESC LIMIT 1
         ) active_promo ON true
         WHERE pv.product_id = (SELECT id FROM product WHERE ${col} = $1)
         ${admin ? "" : "AND pv.is_active = true"}
         GROUP BY pv.id, active_promo.discount_type, active_promo.discount_value, active_promo.expires_at
         ORDER BY pv.price ASC`,
        [productId]
      ),
    ]);

    if (productResult.rows.length === 0) return null;

    const product    = productResult.rows[0];
    product.variants = variantsResult.rows;
    return product;
  }

  // ─── Produits mis en avant ────────────────────────────
  static async findFeatured(limit = 8) {
    const result = await database.query(
      `SELECT DISTINCT ON (p.id)
         p.id, p.name_fr, p.slug, p.images,
         (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM review r WHERE r.product_id = p.id) AS rating_avg,
         (SELECT COUNT(*) FROM review r WHERE r.product_id = p.id)::int AS rating_count,
         p.is_featured, p.is_new, p.created_at,
         c.id      AS category_id, c.name_fr AS category_name, c.slug AS category_slug,
         s.id      AS supplier_id, s.name AS supplier_name, s.slug AS supplier_slug, s.is_certified_bio,
         (SELECT MIN(
            CASE
              WHEN vp.discount_type = 'percent' THEN pv2.price * (1 - vp.discount_value / 100)
              WHEN vp.discount_type = 'fixed'   THEN GREATEST(0, pv2.price - vp.discount_value)
              ELSE pv2.price
            END
          )
          FROM product_variant pv2
          LEFT JOIN LATERAL (
            SELECT discount_type, discount_value
            FROM variant_promotion vp2
            WHERE vp2.variant_id = pv2.id
              AND vp2.is_active = true
              AND vp2.starts_at <= NOW()
              AND vp2.expires_at > NOW()
            ORDER BY vp2.created_at DESC LIMIT 1
          ) vp ON true
          WHERE pv2.product_id = p.id AND pv2.is_active = true) AS min_price,
         (SELECT pv2.id FROM product_variant pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true
          ORDER BY pv2.price ASC LIMIT 1) AS cheapest_variant_id,
         (SELECT COALESCE(SUM(pv2.stock), 0) FROM product_variant pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true) AS total_stock,
         (SELECT MIN(pv2.price) FROM product_variant pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true) AS original_min_price
       FROM product p
       LEFT JOIN category c ON c.id = p.category_id
       LEFT JOIN supplier  s ON s.id = p.supplier_id
       WHERE p.is_active = true AND p.is_featured = true
       ORDER BY p.id, p.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // ─── Recherche plein texte ────────────────────────────
  static async search(query, { page = 1, limit = 12 } = {}) {
    const offset = (page - 1) * limit;
    const result = await database.query(
      `SELECT p.*
       FROM product p
       WHERE p.is_active = true
         AND to_tsvector('french', p.name_fr || ' ' || COALESCE(p.description_fr, ''))
             @@ plainto_tsquery('french', $1)
       ORDER BY p.views_count DESC
       LIMIT $2 OFFSET $3`,
      [query, limit, offset]
    );
    return result.rows;
  }

  // ─── Créer ────────────────────────────────────────────
  static async create(data) {
    const result = await database.query(
      `INSERT INTO product
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

  // ─── Update complet ───────────────────────────────────
  static async updateFull(id, data) {
    const result = await database.query(
      `UPDATE product SET
         name_fr=$1, description_fr=$2, ethical_info_fr=$3,
         origin=$4, certifications=$5,
         usage_fr=$6, ingredients_fr=$7, precautions_fr=$8,
         supplier_id=$9, category_id=$10,
         slug=$11, is_active=$12, is_featured=$13, images=$14,
         is_new=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [
        data.name_fr, data.description_fr, data.ethical_info_fr,
        data.origin, data.certifications,
        data.usage_fr, data.ingredients_fr, data.precautions_fr,
        data.supplier_id, data.category_id,
        data.slug, data.is_active, data.is_featured, data.images,
        data.is_new, id,
      ]
    );
    return result.rows[0];
  }

  // ─── Update simple (COALESCE) ─────────────────────────
  static async update(id, data) {
    const result = await database.query(
      `UPDATE product
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
      [data.name_fr, data.description_fr, data.category_id, data.supplier_id,
       data.images, data.is_active, data.is_featured, data.is_new, id]
    );
    return result.rows[0];
  }

  // ─── Incrémenter les vues ─────────────────────────────
  static async incrementViews(id) {
    await database.query(
      "UPDATE product SET views_count = views_count + 1 WHERE id = $1", [id]
    );
  }

  // ─── Tracker une vue (fire-and-forget) ───────────────
  static trackView(productId, col = "id") {
    database.query(`UPDATE product SET views_count = views_count + 1 WHERE ${col} = $1`, [productId]);
    database.query(`INSERT INTO product_view (product_id) SELECT id FROM product WHERE ${col} = $1`, [productId]);
  }

  // ─── Soft delete ─────────────────────────────────────
  static async softDelete(id) {
    await database.query(
      "UPDATE product SET is_active = false, updated_at = NOW() WHERE id = $1", [id]
    );
  }

  // ─── Hard delete ─────────────────────────────────────
  static async delete(id) {
    await database.query("DELETE FROM product WHERE id = $1", [id]);
  }
}

export default Product;