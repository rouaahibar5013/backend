import express from "express";
import {
  createProduct,
  fetchAllProducts,
  fetchFeaturedProducts,
  fetchSingleProduct,
  updateProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  deleteVariant,
} from "../controllers/productController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";
import {
  getVariantPromotions,
  createVariantPromotion,
  toggleVariantPromotion,
  deleteVariantPromotion,
} from "../controllers/variantPromotionController.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────
router.get("/featured",        fetchFeaturedProducts);  // homepage featured products
router.get("/",                fetchAllProducts);        // browse + search + filter
router.get("/:productId",      fetchSingleProduct);      // full product + variants + reviews

// ── Admin only ───────────────────────────────────────────
router.post("/",               isAuthenticated, isAdmin, createProduct);
router.put("/:productId",      isAuthenticated, isAdmin, updateProduct);
router.delete("/:productId",   isAuthenticated, isAdmin, deleteProduct);

// ── Variant routes (admin) ───────────────────────────────
router.post("/:productId/variants",                 isAuthenticated, isAdmin, addVariant);
router.put("/:productId/variants/:variantId",       isAuthenticated, isAdmin, updateVariant);
router.delete("/:productId/variants/:variantId",    isAuthenticated, isAdmin, deleteVariant);

// Variant promotions (admin)
router.get(   "/:productId/variants/:variantId/promotions",            isAuthenticated, isAdmin, getVariantPromotions);
router.post(  "/:productId/variants/:variantId/promotions",            isAuthenticated, isAdmin, createVariantPromotion);
router.put(   "/:productId/variants/:variantId/promotions/:promoId",   isAuthenticated, isAdmin, toggleVariantPromotion);
router.delete("/:productId/variants/:variantId/promotions/:promoId",   isAuthenticated, isAdmin, deleteVariantPromotion);

export default router;