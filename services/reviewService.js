import { Review, Product } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache } from "../utils/cacheInvalideation.js";


// ═══════════════════════════════════════════════════════════
// CREATE REVIEW
// ═══════════════════════════════════════════════════════════
export const createReviewService = async ({ productId, userId, rating, comment }) => {
  if (!rating || rating < 1 || rating > 5)
    throw new ErrorHandler("La note doit être comprise entre 1 et 5.", 400);

  const product = await Product.findById(productId);
  if (!product || !product.is_active)
    throw new ErrorHandler("Produit introuvable.", 404);

  const hasPurchased = await Review.verifyPurchase({ userId, productId });
  if (!hasPurchased)
    throw new ErrorHandler("Vous pouvez uniquement noter un produit que vous avez acheté et reçu.", 403);

  const existing = await Review.findByUserAndProduct(userId, productId);
  if (existing)
    throw new ErrorHandler("Vous avez déjà laissé un avis pour ce produit.", 409);

  const review = await Review.create({
    product_id: productId, user_id: userId, rating, comment: comment.trim(),
  });

  await invalidateOffresCache();
  return review;
};


// ═══════════════════════════════════════════════════════════
// GET REVIEWS D'UN PRODUIT (public)
// ═══════════════════════════════════════════════════════════
export const getProductReviewsService = async (productId) => {
  return await Review.findByProductIdWithStats(productId);
};


// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW
// ═══════════════════════════════════════════════════════════
export const updateReviewService = async ({ reviewId, userId, rating, comment }) => {
  if (rating !== undefined && (rating < 1 || rating > 5))
    throw new ErrorHandler("La note doit être comprise entre 1 et 5.", 400);

  const current = await Review.findByIdAndUser(reviewId, userId);
  if (!current)
    throw new ErrorHandler("Avis introuvable.", 404);

  const updated = await Review.update(reviewId, {
    rating:  rating  ?? current.rating,
    comment: comment ? comment.trim() : current.comment,
  });

  await invalidateOffresCache();
  return updated;
};


// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// ═══════════════════════════════════════════════════════════
export const deleteReviewService = async ({ reviewId, userId, role }) => {
  if (role === "admin") {
    const deleted = await Review.deleteById(reviewId);
    if (!deleted) throw new ErrorHandler("Avis introuvable.", 404);
    await invalidateOffresCache();
    return;
  }

  const review = await Review.findByIdAndUser(reviewId, userId);
  if (!review) throw new ErrorHandler("Avis introuvable.", 404);

  await Review.delete(reviewId);
  await invalidateOffresCache();
};


// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllReviewsService = async ({ rating, date_from, date_to, page = 1 }) => {
  return await Review.findAllAdmin({ rating, date_from, date_to, page });
};