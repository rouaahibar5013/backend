import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import * as wishlistService from "../services/wishlistService.js";

// ═══════════════════════════════════════════════════════════
// GET MY WISHLIST
// GET /api/wishlist
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const getWishlist = catchAsyncErrors(async (req, res, next) => {
  const items = await wishlistService.getWishlistService(req.user.id);

  res.status(200).json({
    success:    true,
    totalItems: items.length,
    items,
  });
});


// ═══════════════════════════════════════════════════════════
// ADD TO WISHLIST
// POST /api/wishlist/:productId
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const addToWishlist = catchAsyncErrors(async (req, res, next) => {
  const item = await wishlistService.addToWishlistService({
    userId:    req.user.id,
    productId: req.params.productId,
  });

  res.status(201).json({
    success: true,
    message: "Produit ajouté à votre wishlist.",
    item,
  });
});


// ═══════════════════════════════════════════════════════════
// REMOVE FROM WISHLIST
// DELETE /api/wishlist/:productId
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const removeFromWishlist = catchAsyncErrors(async (req, res, next) => {
  await wishlistService.removeFromWishlistService({
    userId:    req.user.id,
    productId: req.params.productId,
  });

  res.status(200).json({
    success: true,
    message: "Produit retiré de votre wishlist.",
  });
});


// ═══════════════════════════════════════════════════════════
// CLEAR WISHLIST
// DELETE /api/wishlist
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const clearWishlist = catchAsyncErrors(async (req, res, next) => {
  await wishlistService.clearWishlistService(req.user.id);

  res.status(200).json({
    success: true,
    message: "Wishlist vidée avec succès.",
  });
});