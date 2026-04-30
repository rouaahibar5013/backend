import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as recipeService from "../services/recipeService.js";

// ═══════════════════════════════════════════════════════════
// CREATE RECIPE
// POST /api/recipes
// Requires: isAuthenticated + isAdmin
// ═══════════════════════════════════════════════════════════
export const createRecipe = catchAsyncErrors(async (req, res, next) => {
 const toInt = (val) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = parseInt(val);
  return isNaN(n) ? null : n;
};
  const {
    title_fr,  description_fr, 
    prep_time, cook_time, servings, difficulty,
    category, is_published, is_featured,
    ingredients, steps,
  } = req.body;

  if (!title_fr)
    return next(new ErrorHandler("Veuillez fournir un titre.", 400));

  const parsedIngredients = typeof ingredients === "string"
    ? JSON.parse(ingredients) : ingredients;

  const parsedSteps = typeof steps === "string"
    ? JSON.parse(steps) : steps;

  if (!parsedSteps || parsedSteps.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins une étape.", 400));

  const recipe = await recipeService.createRecipeService({
   title_fr,
  description_fr,
  prep_time:  toInt(prep_time),   // ✅
  cook_time:  toInt(cook_time),   // ✅
  servings:   toInt(servings),    // ✅
  difficulty,
  category,
  is_published,
  is_featured,
  ingredients: parsedIngredients || [],
  steps:       parsedSteps,
  userId:      req.user.id,
  coverImageFile: req.files?.cover_image || null,
});

  res.status(201).json({
    success: true,
    message: "Recette créée avec succès.",
    recipe,
  });
});


// ═══════════════════════════════════════════════════════════
// FETCH ALL RECIPES (public)
// GET /api/recipes
// ═══════════════════════════════════════════════════════════
export const fetchAllRecipes = catchAsyncErrors(async (req, res, next) => {
  const { category, difficulty, search } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await recipeService.fetchAllRecipesService({
    category, difficulty, search, page,
  });

  res.status(200).json({ success: true, ...data });
});


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE RECIPE (public)
// GET /api/recipes/:slug
// ═══════════════════════════════════════════════════════════
export const fetchSingleRecipe = catchAsyncErrors(async (req, res, next) => {
  const recipe = await recipeService.fetchSingleRecipeService(req.params.slug);
  res.status(200).json({ success: true, recipe });
});


// ═══════════════════════════════════════════════════════════
// FETCH FEATURED RECIPES (public)
// GET /api/recipes/featured
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedRecipes = catchAsyncErrors(async (req, res, next) => {
  const recipes = await recipeService.fetchFeaturedRecipesService();
  res.status(200).json({ success: true, recipes });
});


// ═══════════════════════════════════════════════════════════
// UPDATE RECIPE (admin)
// PUT /api/recipes/:recipeId
// ═══════════════════════════════════════════════════════════
export const updateRecipe = catchAsyncErrors(async (req, res, next) => {
  const toInt = (val) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = parseInt(val);
  return isNaN(n) ? null : n;
};
  const {
    title_fr, description_fr, 
    prep_time, cook_time, servings, difficulty,
    category, is_published, is_featured,ingredients, 
  } = req.body;

// updateRecipe
const recipe = await recipeService.updateRecipeService({
  recipeId: req.params.recipeId,
  title_fr,
  description_fr,
  prep_time:  toInt(prep_time),   
  cook_time:  toInt(cook_time),   
  servings:   toInt(servings),    
  difficulty,
  category,
  is_published,
  is_featured,
  ingredients: ingredients
      ? (typeof ingredients === "string" ? JSON.parse(ingredients) : ingredients)
      : null, 
  coverImageFile: req.files?.cover_image || null,
});

  res.status(200).json({
    success: true,
    message: "Recette mise à jour avec succès.",
    recipe,
  });
});


// ═══════════════════════════════════════════════════════════
// DELETE RECIPE (admin)
// DELETE /api/recipes/:recipeId
// ═══════════════════════════════════════════════════════════
export const deleteRecipe = catchAsyncErrors(async (req, res, next) => {
  await recipeService.deleteRecipeService(req.params.recipeId);
  res.status(200).json({
    success: true,
    message: "Recette supprimée avec succès.",
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL RECIPES ADMIN (admin)
// GET /api/recipes/admin/all
// ═══════════════════════════════════════════════════════════
export const getAllRecipesAdmin = catchAsyncErrors(async (req, res, next) => {
  const recipes = await recipeService.getAllRecipesAdminService();
  res.status(200).json({
    success:      true,
    totalRecipes: recipes.length,
    recipes,
  });

});

// ═══════════════════════════════════════════════════════════
// GET SINGLE RECIPE BY ID (admin) — inclut ingrédients + étapes
// GET /api/recipes/admin/:recipeId
// ═══════════════════════════════════════════════════════════
export const getRecipeByIdAdmin = catchAsyncErrors(async (req, res, next) => {
  const recipe = await recipeService.getRecipeByIdAdminService(req.params.recipeId);
  res.status(200).json({ success: true, recipe });
});