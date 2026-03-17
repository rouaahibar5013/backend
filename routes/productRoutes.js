import express from "express";
import {
  createProduct,
  fetchAllProducts,
  fetchSingleProduct,
  updateProduct,
  deleteProduct,
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
router.post("/",                          isAuthenticated, isAdmin, createProduct);
router.put("/:productId",                 isAuthenticated, isAdmin, updateProduct);
router.delete("/:productId",              isAuthenticated, isAdmin, deleteProduct);

// ── Variant routes ───────────────────────────────────────
router.post("/:productId/variants",                   isAuthenticated, isAdmin, addVariant);
router.put("/:productId/variants/:variantId",         isAuthenticated, isAdmin, updateVariant);
router.delete("/:productId/variants/:variantId",      isAuthenticated, isAdmin, deleteVariant);

export default router;