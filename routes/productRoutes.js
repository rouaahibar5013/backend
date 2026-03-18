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

export default router;