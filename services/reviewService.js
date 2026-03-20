import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// ═══════════════════════════════════════════════════════════
export const createReviewService = async ({ productId, userId, rating, title, comment }) => {
  // Vérifier que le produit existe
  const product = await database.query(
    "SELECT id FROM products WHERE id=$1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Produit introuvable.", 404);

  // Vérifier que l'user n'a pas déjà laissé un avis sur ce produit
  const existing = await database.query(
    "SELECT id FROM reviews WHERE product_id=$1 AND user_id=$2",
    [productId, userId]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler("Vous avez déjà laissé un avis pour ce produit.", 400);

  // Vérifier que l'user a acheté ET reçu ce produit
  const ordered = await database.query(
    `SELECT oi.id FROM order_items oi
     LEFT JOIN orders           o  ON o.id  = oi.order_id
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     WHERE o.user_id     = $1
     AND   pv.product_id = $2
     AND   o.status      = 'delivered'`,
    [userId, productId]
  );
  if (ordered.rows.length === 0)
    throw new ErrorHandler(
      "Vous pouvez uniquement noter un produit que vous avez acheté et reçu.", 403
    );

  // Créer l'avis
  // ✅ is_approved = true directement (pas de modération)
  // ✅ is_verified_purchase = true car on a vérifié l'achat
  const result = await database.query(
    `INSERT INTO reviews
      (product_id, user_id, rating, title, comment, is_approved, is_verified_purchase)
     VALUES ($1, $2, $3, $4, $5, true, true)
     RETURNING *`,
    [productId, userId, rating, title || null, comment]
  );

  // Note : le trigger trg_rating_refresh met à jour la note moyenne automatiquement ✅

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// GET PRODUCT REVIEWS
// Retourne seulement les avis approuvés
// ═══════════════════════════════════════════════════════════
export const getProductReviewsService = async (productId) => {
  // ✅ Run reviews + stats in parallel
  const [result, avg] = await Promise.all([
    database.query(
      `SELECT
         r.id,
         r.rating,
         r.title,
         r.comment,
         r.is_verified_purchase,
         r.helpful_count,
         r.created_at,
         u.name   AS user_name,
         u.avatar AS user_avatar
       FROM reviews r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id  = $1
       AND   r.is_approved = true
       ORDER BY r.created_at DESC`,
      [productId]
    ),
    database.query(
      `SELECT
         ROUND(AVG(rating)::numeric, 2) AS average_rating,
         COUNT(*) AS total_reviews
       FROM reviews
       WHERE product_id=$1 AND is_approved=true`,
      [productId]
    ),
  ]);

  return {
    averageRating: avg.rows[0].average_rating,
    totalReviews:  parseInt(avg.rows[0].total_reviews),
    reviews:       result.rows,
  };
};


// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW
// ═══════════════════════════════════════════════════════════
export const updateReviewService = async ({ reviewId, userId, rating, title, comment }) => {
  const review = await database.query(
    "SELECT * FROM reviews WHERE id=$1 AND user_id=$2",
    [reviewId, userId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  const result = await database.query(
    `UPDATE reviews
     SET rating=$1, title=$2, comment=$3
     WHERE id=$4 RETURNING *`,
    [
      rating  || review.rows[0].rating,
      title   || review.rows[0].title,
      comment || review.rows[0].comment,
      reviewId,
    ]
  );

  // Note : le trigger trg_rating_refresh met à jour la note moyenne automatiquement ✅

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// ═══════════════════════════════════════════════════════════
export const deleteReviewService = async ({ reviewId, userId, role }) => {
  // Admin peut supprimer n'importe quel avis, user seulement le sien
  const condition = role === "admin" ? "id=$1" : "id=$1 AND user_id=$2";
  const values    = role === "admin" ? [reviewId] : [reviewId, userId];

  const review = await database.query(
    `DELETE FROM reviews WHERE ${condition} RETURNING *`, values
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  // Note : le trigger trg_rating_refresh met à jour la note moyenne automatiquement ✅
};


// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllReviewsService = async () => {
  const result = await database.query(
    `SELECT
       r.*,
       u.name  AS user_name,
       u.email AS user_email,
       p.name  AS product_name
     FROM reviews r
     LEFT JOIN users    u ON u.id = r.user_id
     LEFT JOIN products p ON p.id = r.product_id
     ORDER BY r.created_at DESC`
  );

  return result.rows;
};