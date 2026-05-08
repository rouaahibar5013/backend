import { Wishlist, Product } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// GET MY WISHLIST
// ═══════════════════════════════════════════════════════════
export const getWishlistService = async (userId) => {
  return await Wishlist.findByUserId(userId);
};


// ═══════════════════════════════════════════════════════════
// ADD TO WISHLIST
// ═══════════════════════════════════════════════════════════
export const addToWishlistService = async ({ userId, productId }) => {
  const product = await Product.findById(productId);
  if (!product)
    throw new ErrorHandler("Produit introuvable.", 404);

  const existing = await Wishlist.findOne(userId, productId);
  if (existing)
    throw new ErrorHandler("Ce produit est déjà dans votre wishlist.", 400);

  return await Wishlist.add(userId, productId);
};


// ═══════════════════════════════════════════════════════════
// REMOVE FROM WISHLIST
// ═══════════════════════════════════════════════════════════
export const removeFromWishlistService = async ({ userId, productId }) => {
  const existing = await Wishlist.findOne(userId, productId);
  if (!existing)
    throw new ErrorHandler("Produit introuvable dans votre wishlist.", 404);

  await Wishlist.remove(userId, productId);
};


// ═══════════════════════════════════════════════════════════
// CLEAR WISHLIST
// ═══════════════════════════════════════════════════════════
export const clearWishlistService = async (userId) => {
  await Wishlist.clear(userId);
};