import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// HELPER — Vérifier que l'user a acheté ce produit
// (au moins une commande livrée contenant ce produit)
// ═══════════════════════════════════════════════════════════
const verifyPurchase = async ({ userId, productId }) => {
  const result = await database.query(
    `SELECT 1
     FROM orders o
     JOIN order_items      oi ON oi.order_id  = o.id
     JOIN product_variants pv ON pv.id        = oi.variant_id
     WHERE o.user_id     = $1
       AND pv.product_id = $2
       AND o.status      = 'livree'
     LIMIT 1`,
    [userId, productId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler(
      "Vous pouvez uniquement noter un produit que vous avez acheté et reçu.", 403
    );
};

// ═══════════════════════════════════════════════════════════
// GET PRODUITS REVIEWABLES (user connecté)
// Produits livrés sans review existante de cet user
// ═══════════════════════════════════════════════════════════
export const getReviewableProductsService = async (userId) => {
  const result = await database.query(
    `SELECT DISTINCT
       p.id         AS product_id,
       p.name_fr    AS product_name,
       p.images,
       p.slug,
       MAX(o.created_at) AS last_order_date
     FROM orders o
     JOIN order_items      oi ON oi.order_id  = o.id
     JOIN product_variants pv ON pv.id        = oi.variant_id
     JOIN products          p  ON p.id         = pv.product_id
     WHERE o.user_id  = $1
       AND o.status   = 'livree'
       AND p.id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM review r
         WHERE r.product_id = p.id
           AND r.user_id    = $1
       )
     GROUP BY p.id, p.name_fr, p.images, p.slug
     ORDER BY last_order_date DESC`,
    [userId]
  );

  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// ═══════════════════════════════════════════════════════════
export const createReviewService = async ({
  productId, userId, rating, comment,
}) => {
  // ── Vérifier produit existe ──────────────────────────────
  const product = await database.query(
    "SELECT id FROM products WHERE id = $1 AND is_active = true",
    [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Produit introuvable.", 404);

  // ── Vérifier que l'user a bien acheté et reçu ce produit ─
  await verifyPurchase({ userId, productId });

  // ── Vérifier pas de review existante (1 review / produit / user) ──
  const existing = await database.query(
    `SELECT id FROM review
     WHERE product_id = $1
       AND user_id    = $2`,
    [productId, userId]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler(
      "Vous avez déjà laissé un avis pour ce produit.", 409
    );

  // ── INSERT — is_approved = false (modération admin) ──────
  const result = await database.query(
    `INSERT INTO review
       (product_id, user_id, rating, comment, is_approved)
     VALUES ($1, $2, $3, $4, false)
     RETURNING *`,
    [productId, userId, rating, comment.trim()]
  );

  // ✅ Le trigger trg_rating_refresh s'exécute automatiquement
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// GET REVIEWS D'UN PRODUIT (public)
// Seulement les reviews approuvées
// ═══════════════════════════════════════════════════════════
export const getProductReviewsService = async (productId) => {
  const [reviewsResult, statsResult] = await Promise.all([
    database.query(
      `SELECT
         r.id,
         r.rating,
         r.comment,
         r.created_at,
         u.name   AS user_name,
         u.avatar AS user_avatar
       FROM review r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id  = $1
         AND r.is_approved = true
       ORDER BY r.created_at DESC`,
      [productId]
    ),
    database.query(
      `SELECT
         ROUND(AVG(rating)::numeric, 1) AS average_rating,
         COUNT(*)                        AS total_reviews,
         COUNT(*) FILTER (WHERE rating = 5) AS five_stars,
         COUNT(*) FILTER (WHERE rating = 4) AS four_stars,
         COUNT(*) FILTER (WHERE rating = 3) AS three_stars,
         COUNT(*) FILTER (WHERE rating = 2) AS two_stars,
         COUNT(*) FILTER (WHERE rating = 1) AS one_star
       FROM review
       WHERE product_id  = $1
         AND is_approved = true`,
      [productId]
    ),
  ]);

  return {
    stats: {
      average_rating: parseFloat(statsResult.rows[0].average_rating) || 0,
      total_reviews:  parseInt(statsResult.rows[0].total_reviews),
      distribution: {
        5: parseInt(statsResult.rows[0].five_stars),
        4: parseInt(statsResult.rows[0].four_stars),
        3: parseInt(statsResult.rows[0].three_stars),
        2: parseInt(statsResult.rows[0].two_stars),
        1: parseInt(statsResult.rows[0].one_star),
      },
    },
    reviews: reviewsResult.rows,
  };
};

// ═══════════════════════════════════════════════════════════
// GET MES REVIEWS (user connecté)
// ═══════════════════════════════════════════════════════════
export const getMyReviewsService = async (userId) => {
  const result = await database.query(
    `SELECT
       r.id,
       r.rating,
       r.comment,
       r.is_approved,
       r.created_at,
       p.id      AS product_id,
       p.name_fr AS product_name,
       p.slug    AS product_slug,
       p.images
     FROM review r
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );

  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW (user — seulement si pas encore approuvée)
// ═══════════════════════════════════════════════════════════
export const updateReviewService = async ({ reviewId, userId, rating, comment }) => {
  const review = await database.query(
    "SELECT * FROM review WHERE id = $1 AND user_id = $2",
    [reviewId, userId]
  );

  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  if (review.rows[0].is_approved)
    throw new ErrorHandler(
      "Impossible de modifier un avis déjà approuvé.", 400
    );

  const current = review.rows[0];

  const result = await database.query(
    `UPDATE review
     SET rating  = $1,
         comment = $2
     WHERE id = $3
     RETURNING *`,
    [
      rating  ?? current.rating,
      comment ? comment.trim() : current.comment,
      reviewId,
    ]
  );

  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// User → seulement le sien ET pas encore approuvé
// Admin → n'importe lequel
// ═══════════════════════════════════════════════════════════
export const deleteReviewService = async ({ reviewId, userId, role }) => {
  if (role === "admin") {
    const result = await database.query(
      "DELETE FROM review WHERE id = $1 RETURNING id",
      [reviewId]
    );
    if (result.rows.length === 0)
      throw new ErrorHandler("Avis introuvable.", 404);
    return;
  }

  const review = await database.query(
    "SELECT * FROM review WHERE id = $1 AND user_id = $2",
    [reviewId, userId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  if (review.rows[0].is_approved)
    throw new ErrorHandler(
      "Impossible de supprimer un avis déjà approuvé.", 400
    );

  await database.query("DELETE FROM review WHERE id = $1", [reviewId]);
};

// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin)
// Avec filtres : is_approved, page
// ═══════════════════════════════════════════════════════════
export const getAllReviewsService = async ({ approved, page = 1 }) => {
  const LIMIT  = 20;
  const offset = (page - 1) * LIMIT;

  const conditions = [];
  const values     = [];
  let   i          = 1;

  if (approved !== undefined) {
    conditions.push(`r.is_approved = $${i}`);
    values.push(approved === "true");
    i++;
  }

  const WHERE       = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(LIMIT, offset);

  const [totalResult, result] = await Promise.all([
    database.query(
      `SELECT COUNT(*) FROM review r ${WHERE}`, countValues
    ),
    database.query(
      `SELECT
         r.id,
         r.rating,
         r.comment,
         r.is_approved,
         r.created_at,
         u.name    AS user_name,
         u.email   AS user_email,
         p.name_fr AS product_name,
         p.id      AS product_id
       FROM review r
       LEFT JOIN users    u ON u.id = r.user_id
       LEFT JOIN products p ON p.id = r.product_id
       ${WHERE}
       ORDER BY r.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      values
    ),
  ]);

  return {
    total:      parseInt(totalResult.rows[0].count),
    totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / LIMIT),
    page,
    reviews:    result.rows,
  };
};

// ═══════════════════════════════════════════════════════════
// APPROVE / REJECT REVIEW (admin)
// ═══════════════════════════════════════════════════════════
export const approveReviewService = async ({ reviewId, is_approved }) => {
  const review = await database.query(
    "SELECT id FROM review WHERE id = $1",
    [reviewId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  const result = await database.query(
    `UPDATE review
     SET is_approved = $1
     WHERE id = $2
     RETURNING *`,
    [is_approved, reviewId]
  );

  // ✅ Le trigger trg_rating_refresh met à jour rating_avg automatiquement
  return result.rows[0];
};