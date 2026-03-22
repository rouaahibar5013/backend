import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// GET HOME DATA
// Retourne tout ce dont la home page a besoin
// en une seule requête parallèle
// ═══════════════════════════════════════════════════════════
export const getHomeDataService = async () => {

  // ✅ Toutes les requêtes en parallèle — performance maximale
  const [categoriesResult, newProductsResult, trendingProductsResult] = await Promise.all([

    // ── Categories parentes avec le vrai nombre de produits ──
    // ✅ Compte les produits des sous-catégories aussi
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

    // ── Nouveautés — 6 produits les plus récents ──────────
    // ✅ ORDER BY created_at au lieu de is_new = true
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
          ORDER BY pv.created_at ASC LIMIT 1) AS compare_price
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_active = true
       ORDER BY p.created_at DESC
       LIMIT 6`
    ),

    // ── Tendances — 6 produits les mieux notés ────────────
    // ✅ ORDER BY rating_avg au lieu de views_count
    // Quand views_count sera rempli → changer en ORDER BY views_count DESC
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
          ORDER BY pv.created_at ASC LIMIT 1) AS compare_price
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_active    = true
       AND p.views_count > 0
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
