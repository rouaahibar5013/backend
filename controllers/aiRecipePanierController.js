import { catchAsyncErrors } from '../middlewares/catchAsyncErrors.js';
import { suggererRecettesService } from '../services/aiRecipePanierService.js';
import Product from '../models/Product.js';

const FOOD_PARENT_SLUG ='alimentation-bio';

// ─── Suggérer une recette basée sur le panier ─────────────
//
// Pipeline :
//   1. Validation requête
//   2. findFoodByVariantIds   → panier enrichi (WITH RECURSIVE)
//      nom + ingredients_fr + description_fr + catégorie
//   3. Court-circuit si 0 produit alimentaire (0 appel Gemini)
//   4. findForRecipeAI        → top 100 produits alimentaires actifs/bien notés
//      Gemini décide librement quels produits complètent la recette
//   5. Service                → Gemini + Zod + findCompleteByIds
//
// Réponse finale — chaque ingrédient a une source :
//   basket    → déjà dans le panier du client
//   catalogue → achetable sur Goffa + données produit complètes
//   external  → nécessaire mais non disponible sur Goffa
export const suggererRecettes = catchAsyncErrors(async (req, res) => {
  const { produits } = req.body;

  if (!produits || !Array.isArray(produits) || produits.length === 0) {
    return res.status(400).json({ message: 'Liste de produits manquante ou invalide.' });
  }

  const variantIds = produits.map(p => p.variant_id).filter(Boolean);

  if (variantIds.length === 0) {
    return res.status(400).json({ message: 'Aucun variant_id valide trouvé dans les produits.' });
  }

  // Panier enrichi : filtrage alimentaire via hiérarchie récursive de catégories
  // + nom, ingredients_fr, description_fr, category_name
  const panierAlimentaire = await Product.findFoodByVariantIds(variantIds, {
    foodSlug: FOOD_PARENT_SLUG
  });

  if (panierAlimentaire.length === 0) {
    return res.status(200).json({
      recette: null,
      message: "Votre panier ne contient aucun produit alimentaire. Ajoutez des produits alimentaires pour découvrir des recettes personnalisées."
    });
  }

  // Top 100 produits alimentaires actifs, en stock, bien notés
  // Gemini joue le rôle de chef : il choisit librement les compléments
  const catalogue = await Product.findForRecipeAI({
    foodSlug: FOOD_PARENT_SLUG,
    limit: 100,
  });

  const recette = await suggererRecettesService(panierAlimentaire, catalogue);

  return res.status(200).json({ recette });
});