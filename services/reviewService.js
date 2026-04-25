import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// HELPER — Vérifier que la commande appartient au user
// ET que le produit est dans cette commande
// ET que la commande est livrée
// ═══════════════════════════════════════════════════════════
const verifyOrderOwnership = async ({ userId, orderId, productId }) => {
  const result = await database.query(
    `SELECT
       o.id,
       o.status,
       o.user_id
     FROM orders o
     LEFT JOIN order_items     oi ON oi.order_id  = o.id
     LEFT JOIN product_variants pv ON pv.id        = oi.variant_id
     WHERE o.id          = $1
       AND o.user_id     = $2
       AND pv.product_id = $3`,
    [orderId, userId, productId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler(
      "Commande introuvable ou ce produit ne fait pas partie de cette commande.", 403
    );

  if (result.rows[0].status !== "delivered")
    throw new ErrorHandler(
      "Vous pouvez uniquement noter un produit d'une commande livrée.", 403
    );

  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// GET PRODUITS REVIEWABLES (user connecté)
// Produits livrés sans review existante
// ═══════════════════════════════════════════════════════════
export const getReviewableProductsService = async (userId) => {
  const result = await database.query(
    `SELECT DISTINCT
       p.id          AS product_id,
       p.name_fr     AS product_name,
       p.images,
       p.slug,
       o.id          AS order_id,
       o.order_number,
       o.created_at  AS order_date
     FROM orders o
     LEFT JOIN order_items      oi ON oi.order_id  = o.id
     LEFT JOIN product_variants pv ON pv.id        = oi.variant_id
     LEFT JOIN products          p  ON p.id         = pv.product_id
     -- Exclure les produits déjà reviewés pour cette commande
     WHERE o.user_id      = $1
       AND o.status       = 'delivered'
       AND p.id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM reviews r
         WHERE r.product_id = p.id
           AND r.user_id    = $1
           AND r.order_id   = o.id
       )
     ORDER BY o.created_at DESC`,
    [userId]
  );

  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// ═══════════════════════════════════════════════════════════
export const createReviewService = async ({
  productId, userId, orderId, rating, comment,
}) => {
  // ── Vérifier produit existe ──────────────────────────────
  const product = await database.query(
    "SELECT id FROM products WHERE id = $1 AND is_active = true",
    [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Produit introuvable.", 404);

  // ── Vérifier ownership + commande livrée ─────────────────
  await verifyOrderOwnership({ userId, orderId, productId });

  // ── Vérifier pas de review existante (même produit + user + commande) ──
  const existing = await database.query(
    `SELECT id FROM reviews
     WHERE product_id = $1
       AND user_id    = $2
       AND order_id   = $3`,
    [productId, userId, orderId]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler(
      "Vous avez déjà laissé un avis pour ce produit sur cette commande.", 409
    );

  // ── INSERT — is_approved = false (modération admin) ──────
  const result = await database.query(
    `INSERT INTO reviews
       (product_id, user_id, order_id, rating, comment, is_approved)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING *`,
    [productId, userId, orderId, rating, comment.trim()]
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
       FROM reviews r
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
         -- Distribution des notes
         COUNT(*) FILTER (WHERE rating = 5) AS five_stars,
         COUNT(*) FILTER (WHERE rating = 4) AS four_stars,
         COUNT(*) FILTER (WHERE rating = 3) AS three_stars,
         COUNT(*) FILTER (WHERE rating = 2) AS two_stars,
         COUNT(*) FILTER (WHERE rating = 1) AS one_star
       FROM reviews
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
       p.id       AS product_id,
       p.name_fr  AS product_name,
       p.slug     AS product_slug,
       p.images,
       o.id          AS order_id,
       o.order_number
     FROM reviews r
     LEFT JOIN products p ON p.id = r.product_id
     LEFT JOIN orders   o ON o.id = r.order_id
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
    "SELECT * FROM reviews WHERE id = $1 AND user_id = $2",
    [reviewId, userId]
  );

  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  // ── Empêcher modification après approbation ───────────────
  if (review.rows[0].is_approved)
    throw new ErrorHandler(
      "Impossible de modifier un avis déjà approuvé.", 400
    );

  const current = review.rows[0];

  const result = await database.query(
    `UPDATE reviews
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
      "DELETE FROM reviews WHERE id = $1 RETURNING id",
      [reviewId]
    );
    if (result.rows.length === 0)
      throw new ErrorHandler("Avis introuvable.", 404);
    return;
  }

  // User — vérifier ownership
  const review = await database.query(
    "SELECT * FROM reviews WHERE id = $1 AND user_id = $2",
    [reviewId, userId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  // User ne peut pas supprimer un avis déjà approuvé
  if (review.rows[0].is_approved)
    throw new ErrorHandler(
      "Impossible de supprimer un avis déjà approuvé.", 400
    );

  await database.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
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

  // approved = 'true' | 'false' | undefined (tous)
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
      `SELECT COUNT(*) FROM reviews r ${WHERE}`, countValues
    ),
    database.query(
      `SELECT
         r.id,
         r.rating,
         r.comment,
         r.is_approved,
         r.created_at,
         u.name   AS user_name,
         u.email  AS user_email,
         p.name_fr AS product_name,
         p.id      AS product_id,
         o.order_number
       FROM reviews r
       LEFT JOIN users    u ON u.id = r.user_id
       LEFT JOIN products p ON p.id = r.product_id
       LEFT JOIN orders   o ON o.id = r.order_id
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
    "SELECT id FROM reviews WHERE id = $1",
    [reviewId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  const result = await database.query(
    `UPDATE reviews
     SET is_approved = $1
     WHERE id = $2
     RETURNING *`,
    [is_approved, reviewId]
  );

  // ✅ Le trigger trg_rating_refresh met à jour rating_avg automatiquement
  return result.rows[0];
};