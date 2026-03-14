import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// POST /api/reviews/:productId
// Requires: isAuthenticated
// Body: { rating, comment }
// One review per user per product
// ═══════════════════════════════════════════════════════════
export const createReview = catchAsyncErrors(async (req, res, next) => {
  const { productId }      = req.params;
  const { rating, comment } = req.body;

  // ── Validation ────────────────────────────────────────
  if (!rating)
    return next(new ErrorHandler("Please provide a rating.", 400));

  if (rating < 1 || rating > 5)
    return next(new ErrorHandler("Rating must be between 1 and 5.", 400));

  // ── Check product exists ──────────────────────────────
  const product = await database.query(
    "SELECT id FROM products WHERE id=$1", [productId]
  );
  if (product.rows.length === 0)
    return next(new ErrorHandler("Product not found.", 404));

  // ── Check if user already reviewed this product ───────
  const existing = await database.query(
    "SELECT id FROM reviews WHERE product_id=$1 AND user_id=$2",
    [productId, req.user.id]
  );
  if (existing.rows.length > 0)
    return next(new ErrorHandler("You already reviewed this product.", 400));

  // ── Check if user has ordered this product ────────────
  const ordered = await database.query(
    `SELECT oi.id FROM order_items oi
     LEFT JOIN orders o ON o.id = oi.order_id
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     WHERE o.user_id=$1
     AND pv.product_id=$2
     AND o.status='delivered'`,
    [req.user.id, productId]
  );
  if (ordered.rows.length === 0)
    return next(
      new ErrorHandler(
        "You can only review products you have purchased and received.", 403
      )
    );

  // ── Create review ─────────────────────────────────────
  const result = await database.query(
    `INSERT INTO reviews (product_id, user_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [productId, req.user.id, rating, comment || null]
  );

  // ── Update product average rating ────────────────────
  await database.query(
    `UPDATE products
     SET ratings = (
       SELECT ROUND(AVG(rating)::numeric, 2)
       FROM reviews
       WHERE product_id=$1
     )
     WHERE id=$1`,
    [productId]
  );

  res.status(201).json({
    success: true,
    message: "Review submitted successfully.",
    review:  result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// GET REVIEWS FOR A PRODUCT
// GET /api/reviews/:productId
// Public
// ═══════════════════════════════════════════════════════════
export const getProductReviews = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;

  const result = await database.query(
    `SELECT
       r.*,
       u.name   AS user_name,
       u.avatar AS user_avatar
     FROM reviews r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.product_id=$1
     ORDER BY r.created_at DESC`,
    [productId]
  );

  // Get average rating
  const avg = await database.query(
    `SELECT ROUND(AVG(rating)::numeric, 2) AS average_rating,
            COUNT(*) AS total_reviews
     FROM reviews WHERE product_id=$1`,
    [productId]
  );

  res.status(200).json({
    success:       true,
    averageRating: avg.rows[0].average_rating,
    totalReviews:  avg.rows[0].total_reviews,
    reviews:       result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW
// PUT /api/reviews/:reviewId
// Requires: isAuthenticated
// Body: { rating, comment }
// ═══════════════════════════════════════════════════════════
export const updateReview = catchAsyncErrors(async (req, res, next) => {
  const { reviewId }       = req.params;
  const { rating, comment } = req.body;

  // ── Find review belonging to this user ────────────────
  const review = await database.query(
    "SELECT * FROM reviews WHERE id=$1 AND user_id=$2",
    [reviewId, req.user.id]
  );
  if (review.rows.length === 0)
    return next(new ErrorHandler("Review not found.", 404));

  if (rating && (rating < 1 || rating > 5))
    return next(new ErrorHandler("Rating must be between 1 and 5.", 400));

  const result = await database.query(
    `UPDATE reviews
     SET rating=$1, comment=$2
     WHERE id=$3 RETURNING *`,
    [
      rating  || review.rows[0].rating,
      comment || review.rows[0].comment,
      reviewId,
    ]
  );

  // ── Update product average rating ────────────────────
  await database.query(
    `UPDATE products
     SET ratings = (
       SELECT ROUND(AVG(rating)::numeric, 2)
       FROM reviews WHERE product_id=$1
     )
     WHERE id=$1`,
    [review.rows[0].product_id]
  );

  res.status(200).json({
    success: true,
    message: "Review updated successfully.",
    review:  result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// DELETE /api/reviews/:reviewId
// Requires: isAuthenticated (user can delete own, admin can delete any)
// ═══════════════════════════════════════════════════════════
export const deleteReview = catchAsyncErrors(async (req, res, next) => {
  const { reviewId } = req.params;

  // Admin can delete any review, user can only delete their own
  const condition = req.user.role === "admin"
    ? "id=$1"
    : "id=$1 AND user_id=$2";
  const values = req.user.role === "admin"
    ? [reviewId]
    : [reviewId, req.user.id];

  const review = await database.query(
    `DELETE FROM reviews WHERE ${condition} RETURNING *`, values
  );

  if (review.rows.length === 0)
    return next(new ErrorHandler("Review not found.", 404));

  // ── Update product average rating ────────────────────
  await database.query(
    `UPDATE products
     SET ratings = COALESCE(
       (SELECT ROUND(AVG(rating)::numeric, 2)
        FROM reviews WHERE product_id=$1), 0
     )
     WHERE id=$1`,
    [review.rows[0].product_id]
  );

  res.status(200).json({
    success: true,
    message: "Review deleted successfully.",
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin only)
// GET /api/reviews
// ═══════════════════════════════════════════════════════════
export const getAllReviews = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT
       r.*,
       u.name    AS user_name,
       u.email   AS user_email,
       p.name    AS product_name
     FROM reviews r
     LEFT JOIN users    u ON u.id = r.user_id
     LEFT JOIN products p ON p.id = r.product_id
     ORDER BY r.created_at DESC`
  );

  res.status(200).json({
    success:      true,
    totalReviews: result.rows.length,
    reviews:      result.rows,
  });
});