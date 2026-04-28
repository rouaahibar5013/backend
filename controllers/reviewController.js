import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler          from "../middlewares/errorMiddleware.js";
import * as reviewService    from "../services/reviewService.js";

// ═══════════════════════════════════════════════════════════
// GET PRODUITS REVIEWABLES
// GET /api/reviews/reviewable
// User connecté — liste des produits qu'il peut noter
// ═══════════════════════════════════════════════════════════
export const getReviewableProducts = catchAsyncErrors(async (req, res) => {
  const products = await reviewService.getReviewableProductsService(req.user.id);
  res.status(200).json({ success: true, products });
});

// ═══════════════════════════════════════════════════════════
// GET MES REVIEWS
// GET /api/reviews/my
// ═══════════════════════════════════════════════════════════
export const getMyReviews = catchAsyncErrors(async (req, res) => {
  const reviews = await reviewService.getMyReviewsService(req.user.id);
  res.status(200).json({ success: true, totalReviews: reviews.length, reviews });
});

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

  // ── Validation ───────────────────────────────────────────
  if (!product_id)
    return next(new ErrorHandler("product_id est obligatoire.", 400));

  if (!rating || rating < 1 || rating > 5)
    return next(new ErrorHandler("La note doit être entre 1 et 5.", 400));

  if (!comment || comment.trim().length < 10)
    return next(new ErrorHandler("Le commentaire doit contenir au moins 10 caractères.", 400));

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
    message: "Avis soumis. Il sera publié après validation par notre équipe.",
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

  if (comment && comment.trim().length < 10)
    return next(new ErrorHandler("Le commentaire doit contenir au moins 10 caractères.", 400));

  if (comment && comment.trim().length > 1000)
    return next(new ErrorHandler("Le commentaire ne peut pas dépasser 1000 caractères.", 400));

  const review = await reviewService.updateReviewService({
    reviewId: req.params.reviewId,
    userId:   req.user.id,
    rating:   rating ? parseInt(rating) : undefined,
    comment,
  });

  res.status(200).json({
    success: true,
    message: "Avis mis à jour.",
    review,
  });
});

// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// DELETE /api/reviews/:reviewId
// User → son avis non approuvé | Admin → n'importe lequel
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
// GET /api/reviews?approved=false&page=1
// ═══════════════════════════════════════════════════════════
export const getAllReviews = catchAsyncErrors(async (req, res) => {
  const { approved, page } = req.query;

  const data = await reviewService.getAllReviewsService({
    approved,
    page: parseInt(page) || 1,
  });

  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// APPROVE / REJECT REVIEW (admin)
// PATCH /api/reviews/:reviewId/approve
// Body : { is_approved: true | false }
// ═══════════════════════════════════════════════════════════
export const approveReview = catchAsyncErrors(async (req, res, next) => {
  const { is_approved } = req.body;

  if (is_approved === undefined || is_approved === null)
    return next(new ErrorHandler("is_approved (true/false) est obligatoire.", 400));

  const review = await reviewService.approveReviewService({
    reviewId:    req.params.reviewId,
    is_approved: is_approved === true || is_approved === "true",
  });

  res.status(200).json({
    success: true,
    message: is_approved ? "Avis approuvé et publié." : "Avis rejeté.",
    review,
  });
});