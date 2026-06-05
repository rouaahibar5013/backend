import express from "express";
import {
  createCategory, fetchAllCategories,
  fetchSingleCategory, updateCategory, deleteCategory,
} from "../controllers/categoryController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────
router.get("/",              fetchAllCategories);  // nested tree with subcategories
router.get("/:categoryId",   fetchSingleCategory); // single category + its products

// ── Admin only ───────────────────────────
router.post("/",             isAuthenticated, isAdmin, createCategory);
router.put("/:categoryId",   isAuthenticated, isAdmin, updateCategory);
router.delete("/:categoryId",isAuthenticated, isAdmin, deleteCategory);

export default router;