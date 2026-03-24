import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// HELPER — sélection commune des colonnes produit
// ═══════════════════════════════════════════════════════════
const productColumns = `
  p.id,
  p.name_fr,
  p.name_ar,
  p.slug,
  p.images,
  p.rating_avg,
  p.rating_count,
  p.is_new,
  p.is_featured,
  p.origin,
  s.name AS supplier_name,
  s.slug AS supplier_slug,
  (SELECT pv.price FROM product_variants pv
   WHERE pv.product_id = p.id
   AND   pv.is_active  = true
   ORDER BY pv.created_at ASC LIMIT 1) AS price,
  (SELECT pv.compare_price FROM product_variants pv
   WHERE pv.product_id = p.id
   AND   pv.is_active  = true
   ORDER BY pv.created_at ASC LIMIT 1) AS compare_price
`;


// ═══════════════════════════════════════════════════════════
// GET OFFRES DATA
// Retourne tout ce dont la page offres a besoin
// en une seule requête parallèle
// ═══════════════════════════════════════════════════════════
export const getOffresDataService = async () => {

  const [
    flashDealsResult,
    newProductsResult,
    featuredDealsResult,
    activePromosResult,
  ] = await Promise.all([

    // ── Offres Flash — produits avec prix barré ───────────
    // Triés par % de réduction (le plus grand en premier)
    database.query(
      `SELECT
         ${productColumns},
         ROUND(
           ((pv_main.compare_price - pv_main.price) / pv_main.compare_price * 100)::numeric, 0
         ) AS discount_percent
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN LATERAL (
         SELECT price, compare_price
         FROM product_variants
         WHERE product_id = p.id
         AND   is_active  = true
         AND   compare_price IS NOT NULL
         AND   compare_price > price
         ORDER BY created_at ASC LIMIT 1
       ) pv_main ON true
       WHERE p.is_active       = true
       AND   pv_main.price     IS NOT NULL
       ORDER BY discount_percent DESC
       LIMIT 8`
    ),

    // ── Nouveautés — is_new = true OU créés dans les 30 derniers jours
    database.query(
      `SELECT ${productColumns}
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_active = true
       AND (
         p.is_new = true
         OR p.created_at >= NOW() - INTERVAL '30 days'
       )
       ORDER BY p.created_at DESC
       LIMIT 6`
    ),

    // ── Produits vedettes avec prix barré ─────────────────
    database.query(
      `SELECT ${productColumns}
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_active   = true
       AND   p.is_featured = true
       ORDER BY p.rating_avg DESC
       LIMIT 6`
    ),

    // ── Codes promo actifs publics ────────────────────────
    database.query(
      `SELECT
         id,
         code,
         description_fr,
         description_ar,
         discount_type,
         discount_value,
         min_order_amount,
         expires_at,
         max_uses,
         used_count
       FROM promotions
       WHERE is_active  = true
       AND   starts_at <= NOW()
       AND   expires_at >= NOW()
       AND   (max_uses IS NULL OR used_count < max_uses)
       ORDER BY discount_value DESC
       LIMIT 5`
    ),

  ]);

  return {
    flashDeals:    flashDealsResult.rows,
    newProducts:   newProductsResult.rows,
    featuredDeals: featuredDealsResult.rows,
    activePromos:  activePromosResult.rows,
  };
};


// ═══════════════════════════════════════════════════════════
// VALIDATE PROMO CODE
// Vérifie si un code promo est valide
// ═══════════════════════════════════════════════════════════
export const validatePromoCodeService = async (code) => {
  const result = await database.query(
    `SELECT
       id, code, description_fr, description_ar,
       discount_type, discount_value, min_order_amount,
       expires_at, max_uses, used_count
     FROM promotions
     WHERE UPPER(code)  = UPPER($1)
     AND   is_active    = true
     AND   starts_at   <= NOW()
     AND   expires_at  >= NOW()
     AND   (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );

  if (result.rows.length === 0)
    return null;

  return result.rows[0];
};