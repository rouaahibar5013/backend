import { v2 as cloudinary } from "cloudinary";
import { Recipe, RecipeStep, RecipeIngredient } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import generateSlug from "../utils/generateSlug.js";


// ─── Helper ───────────────────────────────────────────────
const destroyCloudinaryImage = async (url) => {
  if (!url) return;
  const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  if (matches) await cloudinary.uploader.destroy(matches[1]);
};

const insertIngredients = async (recipeId, ingredients) => {
  for (let i = 0; i < ingredients.length; i++) {
    const { name_fr, quantity, product_id, is_bio } = ingredients[i];
    await RecipeIngredient.create({
      recipe_id: recipeId, product_id: product_id || null,
      name_fr, quantity: quantity || null,
      is_bio: is_bio !== false, sort_order: i,
    });
  }
};

const insertSteps = async (recipeId, steps) => {
  for (let i = 0; i < steps.length; i++) {
    const { instruction_fr, duration } = steps[i];
    await RecipeStep.create({
      recipe_id: recipeId, step_number: i + 1,
      instruction_fr: instruction_fr || null,
      duration: duration || null,
    });
  }
};


// ═══════════════════════════════════════════════════════════
// CREATE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const createRecipeService = async ({
  title_fr, description_fr,
  prep_time, cook_time, servings, difficulty,
  category, is_published, is_featured,
  ingredients, steps, userId, coverImageFile,
}) => {
  const slug = generateSlug(title_fr);

  const existing = await Recipe.findBySlug(slug);
  if (existing) throw new ErrorHandler("Une recette avec ce nom existe déjà.", 409);

  let coverImageUrl = null;
  if (coverImageFile) {
    const result = await cloudinary.uploader.upload(
      coverImageFile.tempFilePath,
      { folder: "Goffa_Recipes", width: 1200, crop: "scale" }
    );
    coverImageUrl = result.secure_url;
  }

  const recipe = await Recipe.create({
    title_fr, slug, description_fr: description_fr || null,
    cover_image: coverImageUrl,
    prep_time, cook_time, servings: servings || 4,
    difficulty: difficulty || "facile", category: category || null,
    is_published: is_published || false,
    is_featured: is_featured || false,
    created_by: userId,
  });

  if (ingredients?.length > 0) await insertIngredients(recipe.id, ingredients);
  if (steps?.length > 0)       await insertSteps(recipe.id, steps);

  return recipe;
};


// ═══════════════════════════════════════════════════════════
// FETCH ALL RECIPES (public)
// ═══════════════════════════════════════════════════════════
export const fetchAllRecipesService = async ({ category, difficulty, search, page = 1 }) => {
  return await Recipe.findAllPublic({ category, difficulty, search, page });
};


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE RECIPE (public)
// ═══════════════════════════════════════════════════════════
export const fetchSingleRecipeService = async (slug) => {
  const recipe = await Recipe.findBySlugPublic(slug);
  if (!recipe) throw new ErrorHandler("Recette introuvable.", 404);

  await Recipe.incrementViews(recipe.id);

  recipe.ingredients = await RecipeIngredient.findByRecipeIdWithProduct(recipe.id);
  recipe.steps       = await RecipeStep.findByRecipeId(recipe.id);

  return recipe;
};


// ═══════════════════════════════════════════════════════════
// FETCH FEATURED RECIPES (public)
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedRecipesService = async () => {
  return await Recipe.findFeatured();
};


// ═══════════════════════════════════════════════════════════
// UPDATE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const updateRecipeService = async ({
  recipeId, title_fr, description_fr,
  prep_time, cook_time, servings, difficulty, category,
  is_published, is_featured, coverImageFile, ingredients,
}) => {
  const current = await Recipe.findById(recipeId);
  if (!current) throw new ErrorHandler("Recette introuvable.", 404);

  let coverImageUrl = current.cover_image;
  if (coverImageFile) {
    await destroyCloudinaryImage(coverImageUrl);
    const result = await cloudinary.uploader.upload(
      coverImageFile.tempFilePath,
      { folder: "Goffa_Recipes", width: 1200, crop: "scale" }
    );
    coverImageUrl = result.secure_url;
  }

  const updated = await Recipe.updateFull(recipeId, {
    title_fr:      title_fr      || current.title_fr,
    description_fr: description_fr ?? current.description_fr,
    cover_image:   coverImageUrl,
    prep_time:     prep_time     ?? current.prep_time,
    cook_time:     cook_time     ?? current.cook_time,
    servings:      servings      ?? current.servings,
    difficulty:    difficulty    || current.difficulty,
    category:      category      ?? current.category,
    is_published:  is_published  ?? current.is_published,
    is_featured:   is_featured   ?? current.is_featured,
  });

  if (ingredients !== null && ingredients !== undefined) {
    await RecipeIngredient.deleteByRecipeId(recipeId);
    if (ingredients.length > 0) await insertIngredients(recipeId, ingredients);
  }

  return updated;
};


// ═══════════════════════════════════════════════════════════
// DELETE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const deleteRecipeService = async (recipeId) => {
  const recipe = await Recipe.findById(recipeId);
  if (!recipe) throw new ErrorHandler("Recette introuvable.", 404);

  await destroyCloudinaryImage(recipe.cover_image);
  await Recipe.delete(recipeId); // CASCADE supprime ingredients + steps
};


// ═══════════════════════════════════════════════════════════
// GET ALL RECIPES (admin)
// ═══════════════════════════════════════════════════════════
export const getAllRecipesAdminService = async () => {
  return await Recipe.findAllAdmin();
};


// ═══════════════════════════════════════════════════════════
// GET SINGLE RECIPE BY ID (admin)
// ═══════════════════════════════════════════════════════════
export const getRecipeByIdAdminService = async (recipeId) => {
  const recipe = await Recipe.findById(recipeId);
  if (!recipe) throw new ErrorHandler("Recette introuvable.", 404);

  const [ingredients, steps] = await Promise.all([
    RecipeIngredient.findByRecipeId(recipeId),
    RecipeStep.findByRecipeId(recipeId),
  ]);

  recipe.ingredients = ingredients;
  recipe.steps       = steps;

  return recipe;
};