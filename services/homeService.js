import database from "../database/db.js";

export const getHomeDataService = async () => {

  const [categoriesResult, newProductsResult, trendingProductsResult] = await Promise.all([

    // ── Catégories parentes ──
    database.query(
      `SELECT
         c.id,
         c.name_fr,
         c.name_ar,
         c.slug,
         c.images,
         c.sort_order,
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

    // ── Nouveautés ──
    database.query(
      `SELECT
         p.id,
         p.name_fr,
         p.name_ar,
         p.slug,
         p.images,
         p.rating_avg,
         p.rating_count,
         p.is_new,
         p.origin,
         s.name   AS supplier_name,
         s.slug   AS supplier_slug,
         (SELECT pv.price FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS price,
         (SELECT pv.compare_price FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS compare_price,
         (SELECT pv.id FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS variant_id
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_active = true
       ORDER BY p.created_at DESC
       LIMIT 6`
    ),

    // ── Tendances ──
    database.query(
      `SELECT
         p.id,
         p.name_fr,
         p.name_ar,
         p.slug,
         p.images,
         p.rating_avg,
         p.rating_count,
         p.views_count,
         p.origin,
         s.name   AS supplier_name,
         s.slug   AS supplier_slug,
         (SELECT pv.price FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS price,
         (SELECT pv.compare_price FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS compare_price,
         (SELECT pv.id FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS variant_id
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_active    = true
       AND   p.views_count  > 0
       ORDER BY p.views_count DESC
       LIMIT 6`
    ),

  ]);

  return {
    categories:       categoriesResult.rows,
    newProducts:      newProductsResult.rows,
    trendingProducts: trendingProductsResult.rows,
  };
};