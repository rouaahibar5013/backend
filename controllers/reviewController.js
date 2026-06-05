import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler          from "../middlewares/errorMiddleware.js";
import * as reviewService    from "../services/reviewService.js";

// ═══════════════════════════════════════════════════════════
// GET REVIEWS D'UN PRODUIT (public)
// GET /api/reviews/product/:productId
// ═══════════════════════════════════════════════════════════
export const getProductReviews = catchAsyncErrors(async (req, res) => {
  const data = await reviewService.getProductReviewsService(req.params.productId);
  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// POST /api/reviews
// Body : { product_id, rating, comment }
// ═══════════════════════════════════════════════════════════
export const createReview = catchAsyncErrors(async (req, res, next) => {
  const { product_id, rating, comment } = req.body;

  if (!product_id)
    return next(new ErrorHandler("product_id est obligatoire.", 400));

  if (!rating || rating < 1 || rating > 5)
    return next(new ErrorHandler("La note doit être entre 1 et 5.", 400));

 
  if (comment.trim().length > 1000)
    return next(new ErrorHandler("Le commentaire ne peut pas dépasser 1000 caractères.", 400));

  const review = await reviewService.createReviewService({
    productId: product_id,
    userId:    req.user.id,
    rating:    parseInt(rating),
    comment,
  });

  res.status(201).json({
    success: true,
    message: "Votre avis a été publié.",
    review,
  });
});

// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW
// PUT /api/reviews/:reviewId
// ═══════════════════════════════════════════════════════════
export const updateReview = catchAsyncErrors(async (req, res, next) => {
  const { rating, comment } = req.body;

  if (rating && (rating < 1 || rating > 5))
    return next(new ErrorHandler("La note doit être entre 1 et 5.", 400));

 
  if (comment && comment.trim().length > 1000)
    return next(new ErrorHandler("Le commentaire ne peut pas dépasser 1000 caractères.", 400));

  const review = await reviewService.updateReviewService({
    reviewId: req.params.reviewId,
    userId:   req.user.id,
    rating:   rating ? parseInt(rating) : undefined,
    comment,
  });

  res.status(200).json({ success: true, message: "Avis mis à jour.", review });
});

// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// DELETE /api/reviews/:reviewId
// User → la sienne | Admin → n'importe laquelle
// ═══════════════════════════════════════════════════════════
export const deleteReview = catchAsyncErrors(async (req, res) => {
  await reviewService.deleteReviewService({
    reviewId: req.params.reviewId,
    userId:   req.user.id,
    role:     req.user.role,
  });

  res.status(200).json({ success: true, message: "Avis supprimé." });
});

// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin)
// GET /api/reviews?rating=1&date_from=2024-01-01&date_to=2024-12-31&page=1
// ═══════════════════════════════════════════════════════════
export const getAllReviews = catchAsyncErrors(async (req, res) => {
  const { rating, date_from, date_to, page } = req.query;

  const data = await reviewService.getAllReviewsService({
    rating,
    date_from,
    date_to,
    page: parseInt(page) || 1,
  });

  res.status(200).json({ success: true, ...data });
});