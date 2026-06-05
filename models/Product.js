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
  conditions.push(`
    (SELECT COUNT(*) FROM review r WHERE r.product_id = p.id) > 0
    AND
    (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM review r WHERE r.product_id = p.id) >= $${i}
  `);
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
         is_active, is_featured, is_new,
          usage_fr, ingredients_fr, precautions_fr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        data.name_fr, data.description_fr, data.slug,
        data.category_id || null, data.supplier_id || null, data.created_by || null,
        data.images || null, data.ethical_info_fr || null,
        data.origin || null, data.certifications || null,
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


  // ═══════════════════════════════════════════════════════
  // MÉTHODES DÉDIÉES IA — Recommandation Sana
  // ═══════════════════════════════════════════════════════
 
  // ─── Catalogue léger avec recherche intelligente ──────
  //
  // FIX #1 — logique unifiée : un seul SELECT couvre les deux cas
  //   (avec ou sans mots-clés). Fini la double branche incohérente.
  //
  // FIX #2 — rating_avg toujours dans le SELECT (colonne de la table),
  //   plus de bug SQL "column does not exist" dans ORDER BY.
  //
  // FIX #3 — score normalisé [0..1] :
  //   LEAST(1, ts_rank * 0.70 + similarity * 0.30)
  //   Valeur fixe 0.5 si pas de mots-clés (tri par featured + rating).
  //
  // Paramètres :
  //   keywords    : string[] — joints en phrase pour plainto_tsquery
  //   categoryIds : string[] | null — filtre strict si intent détecté
  //   limit       : number
  //
  // Requiert : CREATE EXTENSION pg_trgm + index GIN (setup_search_indexes.sql)
  static async findForAI({ keywords = [], categoryIds = null, limit = 60 } = {}) {
    const values = [];
    let   i      = 1;
 
    // ── Filtre catégorie (optionnel) ──────────────────────
    const categoryCondition = categoryIds && categoryIds.length > 0
      ? `AND p.category_id = ANY($${i++})`
      : '';
    if (categoryIds && categoryIds.length > 0) values.push(categoryIds);
 
    // ── Mots-clés ─────────────────────────────────────────
    const hasKeywords = keywords && keywords.length > 0;
    const searchQuery = hasKeywords ? keywords.join(' ') : null;
    const searchIdx   = searchQuery ? i++ : null;
    if (searchQuery) values.push(searchQuery);
 
    values.push(limit);
    const limitIdx = i;
 
    // ── Score hybride normalisé [0..1] ────────────────────
    // Avec mots-clés : FTS (70%) + trigram (30%), plafonné à 1
    // Sans mots-clés : score fixe 0.5, tri par featured + rating_avg
    const scoreExpr = searchQuery
      ? `LEAST(1,
           COALESCE(
             ts_rank(
               to_tsvector('french',
                 p.name_fr                       || ' ' ||
                 COALESCE(p.description_fr, '')  || ' ' ||
                 COALESCE(p.ingredients_fr, '')  || ' ' ||
                 COALESCE(c.name_fr, '')
               ),
               plainto_tsquery('french', $${searchIdx})
             ), 0
           ) * 0.70
           +
           GREATEST(
             similarity(p.name_fr,                        $${searchIdx}),
             similarity(COALESCE(p.ingredients_fr, ''),   $${searchIdx}),
             similarity(COALESCE(c.name_fr, ''),          $${searchIdx})
           ) * 0.30
         )`
      : `0.5`;
 
    // ── Condition de pertinence (uniquement si mots-clés) ─
    const relevanceCondition = searchQuery
      ? `AND (
           to_tsvector('french',
             p.name_fr                       || ' ' ||
             COALESCE(p.description_fr, '')  || ' ' ||
             COALESCE(p.ingredients_fr, '')  || ' ' ||
             COALESCE(c.name_fr, '')
           ) @@ plainto_tsquery('french', $${searchIdx})
           OR similarity(p.name_fr,                       $${searchIdx}) > 0.15
           OR similarity(COALESCE(p.ingredients_fr, ''),  $${searchIdx}) > 0.15
           OR similarity(COALESCE(c.name_fr, ''),         $${searchIdx}) > 0.20
         )`
      : '';
 
    const result = await database.query(`
      SELECT
        p.id,
        p.slug,
        p.name_fr                                 AS nom,
        LEFT(COALESCE(p.description_fr, ''), 200) AS description,
        COALESCE(p.ingredients_fr, '')            AS ingredients,
        COALESCE(c.name_fr, '')                   AS categorie,
        p.rating_avg,
        ${scoreExpr}                              AS ai_score
      FROM product p
      LEFT JOIN category c ON p.category_id = c.id
      WHERE p.is_active = true
        ${categoryCondition}
        ${relevanceCondition}
      ORDER BY ai_score DESC, p.is_featured DESC, p.rating_avg DESC
      LIMIT $${limitIdx}
    `, values);
 
    return result.rows;
  }
 
  // ─── Enrichissement complet par IDs après sélection Gemini ───────────────
  //
  // FIX #4 — CTE pour les promotions actives.
  //   Avant : sous-requête corrélée recalculée pour chaque produit.
  //   Après : deux CTEs pré-calculées une seule fois, puis jointure simple.
  //   Gain significatif dès 3+ produits enrichis simultanément.
  //
  // Batch query unique — évite N+1.
  static async findCompleteByIds(ids) {
    if (!ids || ids.length === 0) return [];
 
    const result = await database.query(`
      WITH active_promos AS (
        -- Toutes les promotions actives en ce moment (calculé une fois)
        SELECT
          vp.variant_id,
          vp.discount_type,
          vp.discount_value
        FROM variant_promotion vp
        WHERE vp.is_active  = true
          AND vp.starts_at <= NOW()
          AND vp.expires_at > NOW()
      ),
      promo_par_produit AS (
        -- Prix promo minimum par produit (calculé une fois)
        SELECT
          pv.product_id,
          MIN(
            CASE
              WHEN ap.discount_type = 'percent'
                THEN ROUND(pv.price * (1 - ap.discount_value / 100), 3)
              WHEN ap.discount_type = 'fixed'
                THEN GREATEST(pv.price - ap.discount_value, 0)
            END
          ) AS prix_promo
        FROM product_variant pv
        JOIN active_promos ap ON ap.variant_id = pv.id
        WHERE pv.is_active = true
        GROUP BY pv.product_id
      )
      SELECT
        p.id,
        p.name_fr,
        p.description_fr,
        p.slug,
        p.images,
        p.is_new,
        p.is_featured,
        p.rating_avg,
        p.rating_count,
        c.name_fr                  AS categorie_fr,
        MIN(pv.price)              AS prix_min,
        COALESCE(SUM(pv.stock), 0) AS stock_total,
        pp.prix_promo
      FROM product p
      LEFT JOIN category c           ON c.id = p.category_id
      LEFT JOIN product_variant pv   ON pv.product_id = p.id AND pv.is_active = true
      LEFT JOIN promo_par_produit pp ON pp.product_id = p.id
      WHERE p.id = ANY($1)
        AND p.is_active = true
      GROUP BY
        p.id, p.name_fr, p.description_fr, p.slug,
        p.images, p.is_new, p.is_featured, p.rating_avg, p.rating_count,
        c.name_fr, pp.prix_promo
    `, [ids]);
 
    return result.rows;
  }



 
  // ═══════════════════════════════════════════════════════
  // MÉTHODES DÉDIÉES IA — Recette Panier
  // ═══════════════════════════════════════════════════════
 
  // ─── Produits alimentaires du panier via hiérarchie récursive ─
  //
  // WITH RECURSIVE : couvre N niveaux de catégories
  //   Alimentation → Bio → Huiles → Spéciales (niveau 3+, couvert automatiquement)
  //
  // Retourne les champs utiles pour le prompt Gemini :
  //   name_fr        → nom du produit (ingrédient principal)
  //   ingredients_fr → composition réelle du produit
  //   description_fr → contexte culinaire
  //   category_name  → type de produit (Épices, Huiles, etc.)
  //
  // Ces données permettent à Gemini de comprendre le panier en profondeur
  // sans avoir besoin de produits populaires non pertinents.
  static async findFoodByVariantIds(variantIds, { foodSlug = 'alimentation-bio' } = {}) {
    if (!variantIds || variantIds.length === 0) return [];
 
    const result = await database.query(
      `WITH RECURSIVE food_categories AS (
         SELECT id FROM category WHERE slug = $2
         UNION
         SELECT c.id FROM category c
         INNER JOIN food_categories fc ON c.parent_id = fc.id
       )
       SELECT DISTINCT
         p.id,
         p.name_fr,
         COALESCE(p.ingredients_fr, '') AS ingredients_fr,
         COALESCE(p.description_fr, '') AS description_fr,
         c.name_fr                        AS category_name
       FROM product p
       JOIN product_variant pv ON pv.product_id = p.id
       JOIN category c         ON c.id = p.category_id
       WHERE pv.id = ANY($1)
         AND p.is_active = true
         AND c.id IN (SELECT id FROM food_categories)`,
      [variantIds, foodSlug]
    );
 
    return result.rows;
  }
 
  // ─── Catalogue FTS pour suggestions recette ─────────────
  //
  // ─── Catalogue alimentaire pour recette ─────────────────
  //
  // Remplace le FTS par un catalogue alimentaire représentatif :
  //   actifs + bien notés + en stock
  //
  // Pourquoi plus de FTS ?
  //   FTS cherchait des produits "similaires" textuellement au panier.
  //   Objectif réel : Gemini joue le rôle de chef cuisinier.
  //   Il reçoit le panier (ingrédients principaux) + un catalogue large.
  //   C'est LUI qui décide quels produits complètent la recette.
  //
  //   FTS "Pâtes + Tomates" → manquait Parmesan, Basilic, Ail
  //   Top 100 alimentaires → Gemini les voit et peut les choisir
  //
  // Tri : rating_avg DESC → produits les mieux notés en premier
  //   → évite de biaiser vers les mêmes produits populaires
  //   → favorise la qualité réelle (avis clients)
  //
  // Paramètres :
  //   foodSlug : string — slug catégorie racine alimentaire
  //   limit    : number — taille du catalogue envoyé à Gemini (défaut 100)
  static async findForRecipeAI({ foodSlug = 'alimentation-bio', limit = 100 } = {}) {
  const result = await database.query(`
    WITH RECURSIVE food_categories AS (
      SELECT id FROM category WHERE slug = $1
      UNION
      SELECT c.id FROM category c
      INNER JOIN food_categories fc ON c.parent_id = fc.id
    )
    SELECT
      p.id,
      p.name_fr,
      p.slug,
      p.images,
      p.ingredients_fr,
      p.usage_fr,
      (SELECT MIN(pv.price)
       FROM product_variant pv
       WHERE pv.product_id = p.id AND pv.is_active = true) AS prix_min
    FROM product p
    JOIN category c ON c.id = p.category_id
    WHERE p.is_active = true
      AND c.id IN (SELECT id FROM food_categories)
    ORDER BY
      p.rating_avg  DESC NULLS LAST,
      p.is_featured DESC,
      p.created_at  DESC
    LIMIT $2
  `, [foodSlug, limit]);

  return result.rows;
}

// ─── BI : produits avec stock critique (min variant < seuil) ──
static async getLowStockProducts(threshold = 5, limit = 10) {
    const result = await database.query(`
        SELECT
            p.name_fr,
            SUM(pv.stock)  AS total_stock,
            MIN(pv.stock)  AS min_variant_stock,
            COUNT(pv.id)   AS variant_count
        FROM product p
        JOIN product_variant pv ON pv.product_id = p.id AND pv.is_active = true
        WHERE p.is_active = true
        GROUP BY p.id, p.name_fr
        HAVING MIN(pv.stock) < $1
        ORDER BY MIN(pv.stock) ASC
        LIMIT $2
    `, [threshold, limit]);
    return result.rows;
}
 
// ─── BI : produits avec peu de ventes ce mois ────────────────
static async getLowSalesProducts(daysBack = 30, limit = 10) {
    const result = await database.query(`
        SELECT p.name_fr, COALESCE(SUM(oi.quantity), 0) AS qty_sold_this_month
        FROM product p
        LEFT JOIN product_variant pv ON pv.product_id = p.id
        LEFT JOIN order_item oi ON oi.variant_id = pv.id
        LEFT JOIN "order" o ON o.id = oi.order_id
            AND o.created_at >= NOW() - ($1 || ' days')::INTERVAL
            AND o.status != 'annulee'
        WHERE p.is_active = true
        GROUP BY p.id, p.name_fr
        ORDER BY qty_sold_this_month ASC
        LIMIT $2
    `, [daysBack, limit]);
    return result.rows;
}
 
// ─── BI : produits les plus vus ───────────────────────────────
static async getMostViewedProducts(limit = 10) {
    const result = await database.query(`
        SELECT name_fr, views_count, rating_avg, rating_count
        FROM product
        WHERE is_active = true
        ORDER BY views_count DESC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
 
// ─── BI : produits groupés par catégorie avec ventes ─────────
static async getProductsByCategory() {
    const result = await database.query(`
        SELECT c.name_fr AS category,
               COUNT(DISTINCT p.id) AS product_count,
               COALESCE(SUM(oi.quantity), 0) AS total_sold
        FROM category c
        LEFT JOIN product p ON p.category_id = c.id AND p.is_active = true
        LEFT JOIN product_variant pv ON pv.product_id = p.id
        LEFT JOIN order_item oi ON oi.variant_id = pv.id
        GROUP BY c.id, c.name_fr
        ORDER BY total_sold DESC
    `);
    return result.rows;
}
 
// ─── BI : produits les mieux notés ───────────────────────────
static async getTopRatedProducts(limit = 5, minReviews = 2) {
    const result = await database.query(`
        SELECT name_fr, rating_avg, rating_count
        FROM product
        WHERE is_active = true AND rating_count >= $1
        ORDER BY rating_avg DESC
        LIMIT $2
    `, [minReviews, limit]);
    return result.rows;
}
 
// ─── BI : produits mis en avant pour campagne email ───────────
static async getFeaturedProductsForEmail(limit = 8) {
    const result = await database.query(`
        SELECT p.name_fr, MIN(pv.price)::numeric AS price
        FROM product p
        JOIN product_variant pv ON pv.product_id = p.id AND pv.is_active = true
        WHERE p.is_active = true AND p.is_featured = true
        GROUP BY p.id, p.name_fr
        ORDER BY RANDOM()
        LIMIT $1
    `, [limit]);
    return result.rows;
}
 
// ─── BI : overview général ────────────────────────────────────
static async getProductOverviewBI() {
    const result = await database.query(`
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_active = true)   AS active,
            COUNT(*) FILTER (WHERE is_featured = true) AS featured
        FROM product
    `);
    return result.rows[0];
}}


export default Product;