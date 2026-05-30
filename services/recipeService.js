
import fs   from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { Recipe, RecipeStep, RecipeIngredient } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import generateSlug from "../utils/generateSlug.js";

const UPLOAD_DIR = path.resolve("public/uploads/recipes");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// ─── Helper ───────────────────────────────────────────────
const uploadRecipeImage = async (imageFile) => {
  const filename = `${uuidv4()}.webp`;
  const filepath = path.join(UPLOAD_DIR, filename);

  await sharp(imageFile.tempFilePath)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(filepath);

  return `/uploads/recipes/${filename}`;  // url publique
};




const deleteRecipeImage = (imageUrl) => {
  if (!imageUrl) return;
  // extrait le filename depuis l'url  ex: "/uploads/recipes/uuid.webp"
  const filename = path.basename(imageUrl);
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filepath, (err) => {
    if (err) console.error("Erreur suppression image recette:", err.message);
  });
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
 if (coverImageFile) coverImageUrl = await uploadRecipeImage(coverImageFile);

  const recipe = await Recipe.create({
    title_fr, slug, description_fr: description_fr || null,
    cover_image: coverImageUrl,
    prep_time, cook_time, servings: servings || 4,
    difficulty: difficulty || "facile", category: category || null,
    is_published: is_published ?? false,
    is_featured:  is_featured  ?? false,
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
  is_published, is_featured, coverImageFile, ingredients, steps,
}) => {
  const current = await Recipe.findById(recipeId);
  if (!current) throw new ErrorHandler("Recette introuvable.", 404);

  let coverImageUrl = current.cover_image;
  if (coverImageFile) {
    deleteRecipeImage(coverImageUrl);                    // ✅ supprime l'ancienne
    coverImageUrl = await uploadRecipeImage(coverImageFile);}

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

  if (steps !== null && steps !== undefined) {
    await RecipeStep.deleteByRecipeId(recipeId);
    if (steps.length > 0) await insertSteps(recipeId, steps);
  }

  return updated;
};


// ═══════════════════════════════════════════════════════════
// DELETE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const deleteRecipeService = async (recipeId) => {
  const recipe = await Recipe.findById(recipeId);
  if (!recipe) throw new ErrorHandler("Recette introuvable.", 404);

 deleteRecipeImage(recipe.cover_image); 
  await Recipe.delete(recipeId); 
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
    RecipeIngredient.findByRecipeIdWithProduct(recipeId),
    RecipeStep.findByRecipeId(recipeId),
  ]);

  recipe.ingredients = ingredients;
  recipe.steps       = steps;

  return recipe;
};