import express from "express";
import {
  createProduct,
  fetchAllProducts,
  fetchSingleProduct,
  updateProduct,
  deleteProduct,
  updateProductStatus,
  fetchPendingProducts,
  addVariant,
  updateVariant,
  deleteVariant,
} from "../controllers/productController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public (no login required) ──────────────────────────
router.get("/",                fetchAllProducts);    // browse + search + filter
router.get("/:productId",      fetchSingleProduct);  // full product + all variants

// ── Admin only ───────────────────────────────────────────
router.get("/admin/pending",              isAuthenticated, isAdmin, fetchPendingProducts);
router.post("/",                          isAuthenticated, isAdmin, createProduct);
router.put("/:productId",                 isAuthenticated, isAdmin, updateProduct);
router.delete("/:productId",              isAuthenticated, isAdmin, deleteProduct);
router.patch("/:productId/status",        isAuthenticated, isAdmin, updateProductStatus);

// ── Variant routes ───────────────────────────────────────
router.post("/:productId/variants",                   isAuthenticated, isAdmin, addVariant);
router.put("/:productId/variants/:variantId",         isAuthenticated, isAdmin, updateVariant);
router.delete("/:productId/variants/:variantId",      isAuthenticated, isAdmin, deleteVariant);

export default router;