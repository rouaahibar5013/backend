import express from "express";
import {
  createRecipe,
  fetchAllRecipes,
  fetchSingleRecipe,
  fetchFeaturedRecipes,
  updateRecipe,
  deleteRecipe,
  getAllRecipesAdmin,
} from "../controllers/recipeController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────
router.get("/",              fetchAllRecipes);
router.get("/featured",      fetchFeaturedRecipes);
router.get("/:slug",         fetchSingleRecipe);

// ── Admin only ───────────────────────────────────────────
router.get("/admin/all",     isAuthenticated, isAdmin, getAllRecipesAdmin);
router.post("/",             isAuthenticated, isAdmin, createRecipe);
router.put("/:recipeId",     isAuthenticated, isAdmin, updateRecipe);
router.delete("/:recipeId",  isAuthenticated, isAdmin, deleteRecipe);

export default router;