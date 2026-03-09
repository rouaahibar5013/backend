import express from "express";
import {
  createSupplier, fetchAllSuppliers, fetchSupplierBySlug,
  updateSupplier, deleteSupplier,
} from "../controllers/supplierController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────
// User clicks "Atelier X" in product page
// → frontend calls GET /api/suppliers/atelier-x
router.get("/:slug", fetchSupplierBySlug);

// ── Admin only ───────────────────────────
router.get("/",               fetchAllSuppliers);
router.post("/",              isAuthenticated, isAdmin, createSupplier);
router.put("/:supplierId",    isAuthenticated, isAdmin, updateSupplier);
router.delete("/:supplierId", isAuthenticated, isAdmin, deleteSupplier);

export default router;