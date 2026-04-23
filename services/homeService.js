import database from "../database/db.js";

export const getHomeDataService = async () => {

 
  const [categoriesResult, newProductsResult, trendingProductsResult] = await Promise.all([

    // ── Catégories parentes — rien à changer ──────────────
    database.query(
      `SELECT
         c.id, c.name_fr, c.slug, c.images, c.sort_order,
         (SELECT COUNT(*) FROM products p
          LEFT JOIN categories sub ON sub.id = p.category_id
          WHERE (sub.parent_id = c.id OR p.category_id = c.id)
          AND p.is_active = true) AS product_count
       FROM categories c
       WHERE c.parent_id IS NULL
       AND   c.is_active = true
       ORDER BY c.sort_order ASC
       LIMIT 8`
    ),

    // ── Nouveautés ─────────────────────────────────────────
    database.query(
      `SELECT
         p.id, p.name_fr, p.slug, p.images,
         p.rating_avg, p.rating_count, p.origin,
         (p.created_at >= NOW() - INTERVAL '30 days') AS is_new,
         s.name AS supplier_name,
         s.slug AS supplier_slug,

         pv_main.id    AS cheapest_variant_id,
         pv_main.price AS price,

         vp_active.discount_type  AS promo_type,
         vp_active.discount_value AS promo_value,
         vp_active.expires_at     AS promo_expires_at,

         CASE
           WHEN vp_active.discount_type = 'percent' THEN
             ROUND((pv_main.price - (pv_main.price * vp_active.discount_value / 100))::numeric, 3)
           WHEN vp_active.discount_type = 'fixed' THEN
             GREATEST(ROUND((pv_main.price - vp_active.discount_value)::numeric, 3), 0)
           ELSE pv_main.price
         END AS min_price,

         CASE
           WHEN vp_active.discount_type = 'percent' THEN
             ROUND(vp_active.discount_value::numeric, 0)
           WHEN vp_active.discount_type = 'fixed' THEN
             ROUND((vp_active.discount_value / pv_main.price * 100)::numeric, 0)
           ELSE NULL
         END AS discount_percent

       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id

       LEFT JOIN LATERAL (
         SELECT id, price
         FROM product_variants
         WHERE product_id = p.id AND is_active = true
         ORDER BY created_at ASC LIMIT 1
       ) pv_main ON true

       LEFT JOIN LATERAL (
         SELECT discount_type, discount_value, expires_at
         FROM variant_promotions
         WHERE variant_id  = pv_main.id
         AND   is_active   = true
         AND   starts_at  <= NOW()
         AND   expires_at >= NOW()
         ORDER BY created_at DESC LIMIT 1
       ) vp_active ON true

       WHERE p.is_active = true
      AND (p.is_new = true OR p.created_at >= NOW() - INTERVAL '30 days')
      ORDER BY p.is_new DESC, p.created_at DESC
      LIMIT 6
      `
    ),

    // ── Tendances ──────────────────────────────────────────
    database.query(
      `SELECT
         p.id, p.name_fr, p.slug, p.images,
         p.rating_avg, p.rating_count, p.origin,
         (p.created_at >= NOW() - INTERVAL '30 days') AS is_new,
         s.name AS supplier_name,
         s.slug AS supplier_slug,
         COUNT(pv_views.id) AS views_this_week,
         p.views_count,

         pv_main.id    AS cheapest_variant_id,
         pv_main.price AS price,

         vp_active.discount_type  AS promo_type,
         vp_active.discount_value AS promo_value,
         vp_active.expires_at     AS promo_expires_at,

         CASE
           WHEN vp_active.discount_type = 'percent' THEN
             ROUND((pv_main.price - (pv_main.price * vp_active.discount_value / 100))::numeric, 3)
           WHEN vp_active.discount_type = 'fixed' THEN
             GREATEST(ROUND((pv_main.price - vp_active.discount_value)::numeric, 3), 0)
           ELSE pv_main.price
         END AS min_price,

         CASE
           WHEN vp_active.discount_type = 'percent' THEN
             ROUND(vp_active.discount_value::numeric, 0)
           WHEN vp_active.discount_type = 'fixed' THEN
             ROUND((vp_active.discount_value / pv_main.price * 100)::numeric, 0)
           ELSE NULL
         END AS discount_percent

       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN product_views pv_views
         ON pv_views.product_id = p.id
         AND pv_views.viewed_at >= NOW() - INTERVAL '7 days'

       LEFT JOIN LATERAL (
         SELECT id, price
         FROM product_variants
         WHERE product_id = p.id AND is_active = true
         ORDER BY created_at ASC LIMIT 1
       ) pv_main ON true

       LEFT JOIN LATERAL (
         SELECT discount_type, discount_value, expires_at
         FROM variant_promotions
         WHERE variant_id  = pv_main.id
         AND   is_active   = true
         AND   starts_at  <= NOW()
         AND   expires_at >= NOW()
         ORDER BY created_at DESC LIMIT 1
       ) vp_active ON true

       WHERE p.is_active = true
       GROUP BY p.id, s.name, s.slug, pv_main.id, pv_main.price,
                vp_active.discount_type, vp_active.discount_value, vp_active.expires_at
       ORDER BY views_this_week DESC, p.views_count DESC
       LIMIT 6`
    ),

  ]);

  return {
    categories:       categoriesResult.rows,
    newProducts:      newProductsResult.rows,
    trendingProducts: trendingProductsResult.rows,
  };
};