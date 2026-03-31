import express from "express";
import {
  createRecipe,
  fetchAllRecipes,
  fetchSingleRecipe,
  fetchFeaturedRecipes,
  updateRecipe,
  deleteRecipe,
  getAllRecipesAdmin,
  getRecipeByIdAdmin,
} from "../controllers/recipeController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.get("/",                fetchAllRecipes);
router.get("/featured",        fetchFeaturedRecipes);
router.get("/admin/all",       isAuthenticated, isAdmin, getAllRecipesAdmin);
router.get("/admin/:recipeId", isAuthenticated, isAdmin, getRecipeByIdAdmin);

router.get("/:slug",           fetchSingleRecipe);

// ── Admin mutations ───────────────────────────────────────
router.post("/",               isAuthenticated, isAdmin, createRecipe);
router.put("/:recipeId",       isAuthenticated, isAdmin, updateRecipe);
router.delete("/:recipeId",    isAuthenticated, isAdmin, deleteRecipe);

export default router;