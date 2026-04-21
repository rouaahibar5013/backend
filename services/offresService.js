import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// HELPER — colonnes communes
// ═══════════════════════════════════════════════════════════
const productColumns = `
  p.id,
  p.name_fr,
  p.slug,
  p.images,
  p.rating_avg,
  p.rating_count,
  p.is_new,
  p.is_featured,
  p.origin,
  s.name AS supplier_name,
  s.slug AS supplier_slug,

  pv_main.id    AS variant_id,
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
  END AS final_price,

  CASE
    WHEN vp_active.discount_type = 'percent' THEN
      ROUND(vp_active.discount_value::numeric, 0)
    WHEN vp_active.discount_type = 'fixed' THEN
      ROUND((vp_active.discount_value / pv_main.price * 100)::numeric, 0)
    ELSE NULL
  END AS discount_percent
`;

// ═══════════════════════════════════════════════════════════
// HELPER — jointures communes
// ═══════════════════════════════════════════════════════════
const productJoins = `
  LEFT JOIN suppliers s ON s.id = p.supplier_id

  LEFT JOIN LATERAL (
    SELECT id, price
    FROM product_variants
    WHERE product_id = p.id
    AND   is_active  = true
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
`;

// ═══════════════════════════════════════════════════════════
// GET OFFRES DATA
// ═══════════════════════════════════════════════════════════
export const getOffresDataService = async () => {

  const [
    flashDealsResult,
    newProductsResult,
    featuredDealsResult,
    activePromosResult,
  ] = await Promise.all([

    // ── Offres Flash ───────────────────────────────────────
    database.query(
      `SELECT ${productColumns}
       FROM products p
       ${productJoins}
       WHERE p.is_active                = true
       AND   pv_main.id               IS NOT NULL
       AND   vp_active.discount_value IS NOT NULL
       ORDER BY discount_percent DESC
       LIMIT 8`
    ),

    // ── Nouveautés ─────────────────────────────────────────
    database.query(
      `SELECT ${productColumns}
       FROM products p
       ${productJoins}
       WHERE p.is_active = true
       AND   pv_main.id IS NOT NULL
       AND (
         p.is_new    = true
         OR p.created_at >= NOW() - INTERVAL '30 days'
       )
       ORDER BY p.created_at DESC
       LIMIT 6`
    ),

    // ── Produits vedettes ──────────────────────────────────
    database.query(
      `SELECT ${productColumns}
       FROM products p
       ${productJoins}
       WHERE p.is_active   = true
       AND   p.is_featured = true
       AND   pv_main.id   IS NOT NULL
       ORDER BY p.rating_avg DESC
       LIMIT 6`
    ),

    // ── Codes promo actifs ─────────────────────────────────
    database.query(
      `SELECT
         id, code, description_fr,
         discount_type, discount_value,
         min_order_amount, expires_at,
         max_uses, used_count
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
// ═══════════════════════════════════════════════════════════
export const validatePromoCodeService = async (code) => {
  const result = await database.query(
    `SELECT
       id, code, description_fr,
       discount_type, discount_value, min_order_amount,
       expires_at, max_uses, used_count
     FROM promotions
     WHERE UPPER(code) = UPPER($1)
     AND   is_active   = true
     AND   starts_at  <= NOW()
     AND   expires_at >= NOW()
     AND   (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
};

