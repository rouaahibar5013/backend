import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as aiService from "../services/aiService.js";

// ═══════════════════════════════════════════════════════════
// RECIPE SUGGESTIONS
// POST /api/ai/recipes
// Public — pas besoin d'être connecté
// Body: { ingredients: ["huile olive", "thym", ...], servings: 4 }
// ═══════════════════════════════════════════════════════════
export const getRecipeSuggestions = catchAsyncErrors(async (req, res, next) => {
  const { ingredients, servings } = req.body;

  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins un ingrédient.", 400));

  if (ingredients.length > 20)
    return next(new ErrorHandler("Maximum 20 ingrédients.", 400));

  // Nettoyer les ingrédients
  const cleanIngredients = ingredients
    .map(i => i.trim())
    .filter(i => i.length > 0);

  const recipes = await aiService.getRecipeSuggestionsService({
    ingredients: cleanIngredients,
    servings:    parseInt(servings) || 4,
  });

  res.status(200).json({
    success:          true,
    totalRecipes:     recipes.length,
    recipes,
  });
});


// ═══════════════════════════════════════════════════════════
// AI PRODUCT SEARCH
// POST /api/ai/search
// Public
// Body: { query: "quelque chose pour peau sèche" }
// ═══════════════════════════════════════════════════════════
export const aiProductSearch = catchAsyncErrors(async (req, res, next) => {
  const { query } = req.body;

  if (!query || query.trim().length === 0)
    return next(new ErrorHandler("Veuillez fournir une recherche.", 400));

  if (query.trim().length > 500)
    return next(new ErrorHandler("La recherche est trop longue (max 500 caractères).", 400));

  const result = await aiService.aiProductSearchService({
    query: query.trim(),
  });

  res.status(200).json({
    success: true,
    ...result,
  });
});


// ═══════════════════════════════════════════════════════════
// AI CHATBOT
// POST /api/ai/chat
// Public
// Body: { message: "...", history: [...] }
// ═══════════════════════════════════════════════════════════
export const aiChat = catchAsyncErrors(async (req, res, next) => {
  const { message, history } = req.body;

  if (!message || message.trim().length === 0)
    return next(new ErrorHandler("Veuillez fournir un message.", 400));

  if (message.trim().length > 1000)
    return next(new ErrorHandler("Message trop long (max 1000 caractères).", 400));

  const result = await aiService.aiChatService({
    message: message.trim(),
    history: history || [],
  });

  res.status(200).json({
    success: true,
    ...result,
  });
});