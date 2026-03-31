import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import generateSlug from "../utils/generateSlug.js";

// ═══════════════════════════════════════════════════════════
// CREATE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const createRecipeService = async ({
  title_fr, title_ar, description_fr, description_ar,
  prep_time, cook_time, servings, difficulty,
  category, is_published, is_featured,
  ingredients, steps, userId, coverImageFile,
}) => {
  // Générer slug
  const slug = generateSlug(title_fr);

  // Vérifier unicité du slug
  const existing = await database.query(
    "SELECT id FROM recipes WHERE slug=$1", [slug]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler("Une recette avec ce nom existe déjà.", 409);

  // Upload image de couverture
  let coverImageUrl = null;
  if (coverImageFile) {
    const result = await cloudinary.uploader.upload(
      coverImageFile.tempFilePath,
      { folder: "Goffa_Recipes", width: 1200, crop: "scale" }
    );
    coverImageUrl = result.secure_url;
  }

  // Créer la recette
  const recipeResult = await database.query(
    `INSERT INTO recipes
      (title_fr, title_ar, slug, description_fr, description_ar,
       cover_image, prep_time, cook_time, servings, difficulty,
       category, is_published, is_featured, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      title_fr, title_ar || null, slug,
      description_fr || null, description_ar || null,
      coverImageUrl, prep_time || null, cook_time || null,
      servings || 4, difficulty || 'facile',
      category || null, is_published || false,
      is_featured || false, userId,
    ]
  );

  const recipe = recipeResult.rows[0];

  // Ajouter les ingrédients
  if (ingredients && ingredients.length > 0) {
    for (let i = 0; i < ingredients.length; i++) {
      const { name_fr, name_ar, quantity, product_id, is_bio } = ingredients[i];
      await database.query(
        `INSERT INTO recipe_ingredients
          (recipe_id, product_id, name_fr, name_ar, quantity, is_bio, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [recipe.id, product_id || null, name_fr, name_ar || null,
         quantity || null, is_bio !== false, i]
      );
    }
  }

  // Ajouter les étapes
  if (steps && steps.length > 0) {
    for (let i = 0; i < steps.length; i++) {
      const { instruction_fr, instruction_ar, duration } = steps[i];
      await database.query(
        `INSERT INTO recipe_steps
          (recipe_id, step_number, instruction_fr, instruction_ar, duration)
         VALUES ($1,$2,$3,$4,$5)`,
        [recipe.id, i + 1, instruction_fr, instruction_ar || null, duration || null]
      );
    }
  }

  return recipe;
};


// ═══════════════════════════════════════════════════════════
// FETCH ALL RECIPES (public)
// Supporte : ?category= ?difficulty= ?search= ?page=
// ═══════════════════════════════════════════════════════════
export const fetchAllRecipesService = async ({
  category, difficulty, search, page = 1
}) => {
  const limit  = 9;
  const offset = (page - 1) * limit;

  const conditions = ["r.is_published = true"];
  const values     = [];
  let   index      = 1;

  if (category) {
    conditions.push(`r.category = $${index}`);
    values.push(category); index++;
  }
  if (difficulty) {
    conditions.push(`r.difficulty = $${index}`);
    values.push(difficulty); index++;
  }
  if (search) {
    conditions.push(`r.title_fr ILIKE $${index}`);
    values.push(`%${search}%`); index++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const countValues = [...values];
  values.push(limit, offset);

  // ✅ Run count + recipes in parallel
  const [totalResult, result] = await Promise.all([
    database.query(
      `SELECT COUNT(*) FROM recipes r ${whereClause}`, countValues
    ),
    database.query(
      `SELECT
         r.id, r.title_fr, r.title_ar, r.slug,
         r.description_fr, r.cover_image,
         r.prep_time, r.cook_time, r.servings,
         r.difficulty, r.category,
         r.is_featured, r.views_count, r.created_at,
         -- Nombre d'ingrédients
         (SELECT COUNT(*) FROM recipe_ingredients ri
          WHERE ri.recipe_id = r.id) AS ingredients_count
       FROM recipes r
       ${whereClause}
       ORDER BY r.is_featured DESC, r.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    ),
  ]);

  const totalRecipes = parseInt(totalResult.rows[0].count);

  return {
    totalRecipes,
    totalPages: Math.ceil(totalRecipes / limit),
    page,
    recipes: result.rows,
  };
};


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE RECIPE (public)
// ═══════════════════════════════════════════════════════════
export const fetchSingleRecipeService = async (slug) => {
  // ✅ Run recipe + ingredients + steps in parallel
  const [recipeResult, ingredientsResult, stepsResult] = await Promise.all([
    database.query(
      `SELECT * FROM recipes WHERE slug=$1 AND is_published=true`,
      [slug]
    ),
    database.query(
      `SELECT
         ri.*,
         p.slug        AS product_slug,
         p.images      AS product_images,
         (SELECT pv.price FROM product_variants pv
          WHERE pv.product_id = p.id
          AND   pv.is_active  = true
          ORDER BY pv.created_at ASC LIMIT 1) AS product_price
       FROM recipe_ingredients ri
       LEFT JOIN products p ON p.id = ri.product_id
       WHERE ri.recipe_id = (
         SELECT id FROM recipes WHERE slug=$1
       )
       ORDER BY ri.sort_order ASC`,
      [slug]
    ),
    database.query(
      `SELECT * FROM recipe_steps
       WHERE recipe_id = (
         SELECT id FROM recipes WHERE slug=$1
       )
       ORDER BY step_number ASC`,
      [slug]
    ),
  ]);

  if (recipeResult.rows.length === 0)
    throw new ErrorHandler("Recette introuvable.", 404);

  const recipe = recipeResult.rows[0];

  // ✅ Incrémenter views_count
  await database.query(
    "UPDATE recipes SET views_count = views_count + 1 WHERE id=$1",
    [recipe.id]
  );

  recipe.ingredients = ingredientsResult.rows;
  recipe.steps       = stepsResult.rows;

  return recipe;
};


// ═══════════════════════════════════════════════════════════
// FETCH FEATURED RECIPES (public)
// Pour la home page ou section mise en avant
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedRecipesService = async () => {
  const result = await database.query(
    `SELECT
       id, title_fr, title_ar, slug, cover_image,
       prep_time, cook_time, difficulty, category,
       views_count, created_at,
       (SELECT COUNT(*) FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipes.id) AS ingredients_count
     FROM recipes
     WHERE is_published = true
     AND   is_featured  = true
     ORDER BY created_at DESC
     LIMIT 6`
  );

  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// UPDATE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const updateRecipeService = async ({
  recipeId, title_fr, title_ar, description_fr, description_ar,
  prep_time, cook_time, servings, difficulty, category,
  is_published, is_featured, coverImageFile,
}) => {
  const recipe = await database.query(
    "SELECT * FROM recipes WHERE id=$1", [recipeId]
  );
  if (recipe.rows.length === 0)
    throw new ErrorHandler("Recette introuvable.", 404);

  // Handle cover image update
  let coverImageUrl = recipe.rows[0].cover_image;
  if (coverImageFile) {
    // Delete old image from Cloudinary
    if (coverImageUrl) {
      const matches = coverImageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      if (matches) await cloudinary.uploader.destroy(matches[1]);
    }
    const result = await cloudinary.uploader.upload(
      coverImageFile.tempFilePath,
      { folder: "Goffa_Recipes", width: 1200, crop: "scale" }
    );
    coverImageUrl = result.secure_url;
  }

  const current = recipe.rows[0];
  const result  = await database.query(
    `UPDATE recipes
     SET title_fr=$1, title_ar=$2, description_fr=$3, description_ar=$4,
         cover_image=$5, prep_time=$6, cook_time=$7, servings=$8,
         difficulty=$9, category=$10, is_published=$11, is_featured=$12
     WHERE id=$13 RETURNING *`,
    [
      title_fr       || current.title_fr,
      title_ar       ?? current.title_ar,
      description_fr ?? current.description_fr,
      description_ar ?? current.description_ar,
      coverImageUrl,
      prep_time      ?? current.prep_time,
      cook_time      ?? current.cook_time,
      servings       ?? current.servings,
      difficulty     || current.difficulty,
      category       ?? current.category,
      is_published   ?? current.is_published,
      is_featured    ?? current.is_featured,
      recipeId,
    ]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// DELETE RECIPE (admin)
// ═══════════════════════════════════════════════════════════
export const deleteRecipeService = async (recipeId) => {
  const recipe = await database.query(
    "SELECT * FROM recipes WHERE id=$1", [recipeId]
  );
  if (recipe.rows.length === 0)
    throw new ErrorHandler("Recette introuvable.", 404);

  // Delete cover image from Cloudinary
  if (recipe.rows[0].cover_image) {
    const matches = recipe.rows[0].cover_image.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (matches) await cloudinary.uploader.destroy(matches[1]);
  }

  // CASCADE supprime automatiquement ingredients + steps
  await database.query("DELETE FROM recipes WHERE id=$1", [recipeId]);
};


// ═══════════════════════════════════════════════════════════
// GET ALL RECIPES (admin)
// ═══════════════════════════════════════════════════════════
export const getAllRecipesAdminService = async () => {
  const result = await database.query(
    `SELECT
       r.id, r.title_fr, r.slug, r.category,
       r.difficulty, r.is_published, r.is_featured,
       r.views_count, r.created_at,
       (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredients_count,
       (SELECT COUNT(*) FROM recipe_steps rs WHERE rs.recipe_id = r.id) AS steps_count
     FROM recipes r
     ORDER BY r.created_at DESC`
  );
  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// GET SINGLE RECIPE BY ID (admin) — pas de filtre is_published
// ═══════════════════════════════════════════════════════════
export const getRecipeByIdAdminService = async (recipeId) => {
  const [recipeResult, ingredientsResult, stepsResult] = await Promise.all([
    database.query(
      `SELECT * FROM recipes WHERE id=$1`,
      [recipeId]
    ),
    database.query(
      `SELECT * FROM recipe_ingredients
       WHERE recipe_id=$1
       ORDER BY sort_order ASC`,
      [recipeId]
    ),
    database.query(
      `SELECT * FROM recipe_steps
       WHERE recipe_id=$1
       ORDER BY step_number ASC`,
      [recipeId]
    ),
  ]);

  if (recipeResult.rows.length === 0)
    throw new ErrorHandler("Recette introuvable.", 404);

  const recipe = recipeResult.rows[0];
  recipe.ingredients = ingredientsResult.rows;
  recipe.steps       = stepsResult.rows;

  return recipe;
};