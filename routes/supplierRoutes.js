import express from "express";
import {
  createSupplier,
  fetchAllSuppliers,
  fetchSupplierBySlug,
  updateSupplier,
  deleteSupplier,
} from "../controllers/supplierController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ✅ GET / AVANT GET /:slug — sinon Express confond les deux
router.get("/",           fetchAllSuppliers);
router.get("/:slug",      fetchSupplierBySlug);

router.post("/",                  isAuthenticated, isAdmin, createSupplier);
router.put("/:supplierId",        isAuthenticated, isAdmin, updateSupplier);
router.delete("/:supplierId",     isAuthenticated, isAdmin, deleteSupplier);

export default router;