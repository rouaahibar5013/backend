import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as reviewService from "../services/reviewService.js";

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// POST /api/reviews/:productId
// Requires: isAuthenticated
// Body: { rating, title (optional), comment }
// ═══════════════════════════════════════════════════════════
export const createReview = catchAsyncErrors(async (req, res, next) => {
  const { rating, title, comment } = req.body;

  if (!rating)
    return next(new ErrorHandler("Veuillez fournir une note.", 400));

  if (rating < 1 || rating > 5)
    return next(new ErrorHandler("La note doit être entre 1 et 5.", 400));

  if (!comment)
    return next(new ErrorHandler("Veuillez fournir un commentaire.", 400));

  const review = await reviewService.createReviewService({
    productId: req.params.productId,
    userId:    req.user.id,
    rating,
    title,
    comment,
  });

  res.status(201).json({
    success: true,
    message: "Avis soumis avec succès.",
    review,
  });
});


// ═══════════════════════════════════════════════════════════
// GET PRODUCT REVIEWS
// GET /api/reviews/:productId
// Public — affiché dans la page détail produit
// ═══════════════════════════════════════════════════════════
export const getProductReviews = catchAsyncErrors(async (req, res, next) => {
  const data = await reviewService.getProductReviewsService(req.params.productId);
  res.status(200).json({ success: true, ...data });
});


// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW
// PUT /api/reviews/:reviewId
// Requires: isAuthenticated
// Body: { rating, title (optional), comment }
// ═══════════════════════════════════════════════════════════
export const updateReview = catchAsyncErrors(async (req, res, next) => {
  const { rating, title, comment } = req.body;

  if (rating && (rating < 1 || rating > 5))
    return next(new ErrorHandler("La note doit être entre 1 et 5.", 400));

  const review = await reviewService.updateReviewService({
    reviewId: req.params.reviewId,
    userId:   req.user.id,
    rating,
    title,
    comment,
  });

  res.status(200).json({
    success: true,
    message: "Avis mis à jour avec succès.",
    review,
  });
});


// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// DELETE /api/reviews/:reviewId
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const deleteReview = catchAsyncErrors(async (req, res, next) => {
  await reviewService.deleteReviewService({
    reviewId: req.params.reviewId,
    userId:   req.user.id,
    role:     req.user.role,
  });

  res.status(200).json({
    success: true,
    message: "Avis supprimé avec succès.",
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin only)
// GET /api/reviews
// ═══════════════════════════════════════════════════════════
export const getAllReviews = catchAsyncErrors(async (req, res, next) => {
  const reviews = await reviewService.getAllReviewsService();
  res.status(200).json({
    success:      true,
    totalReviews: reviews.length,
    reviews,
  });
});