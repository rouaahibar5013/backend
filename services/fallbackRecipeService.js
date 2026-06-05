import Recipe           from '../models/Recipe.js';
import RecipeIngredient from '../models/RecipeIngredient.js';
import RecipeStep       from '../models/RecipeStep.js';

const normalize = s =>
  (s || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// ─── Extraire tous les mots significatifs du panier ──────────────────────────
const extraireMotsPanier = (panierAlimentaire) =>
  panierAlimentaire
    .flatMap(p => [p.name_fr, p.category_name, p.ingredients_fr, p.description_fr])
    .join(' ')
    .split(/[\s,;/()+]+/)
    .map(normalize)
    .filter(s => s.length > 2);

// ─── Score : combien d'ingrédients de la recette sont dans le panier ─────────
const scorerRecette = (ingredients, motsPanier) => {
  if (!ingredients.length) return 0;
  const matches = ingredients.reduce((score, ing) => {
    const nomNorm = normalize(ing.name_fr);
    const match   = motsPanier.some(mot =>
      nomNorm.includes(mot) || mot.includes(nomNorm.split(' ')[0])
    );
    return score + (match ? 1 : 0);
  }, 0);

  // Score normalisé = % d'ingrédients de la recette présents dans le panier
  return matches / ingredients.length;
};

// ─── Mapper les ingrédients → basket / catalogue / external ─────────────────
//
// Même logique que Gemini :
//   1. product_id présent en BDD → chercher dans catalogue → "catalogue"
//   2. Sinon chercher le nom dans le panier               → "basket"
//   3. Sinon                                              → "external"
//
const mapperIngredients = (ingredients, panierAlimentaire, catalogue) => {
  return ingredients.map(ing => {
    const nomNorm = normalize(ing.name_fr);

    // 1. Chercher dans le panier du client
    const inBasket = panierAlimentaire.find(p =>
      normalize(p.name_fr || '').includes(nomNorm) ||
      nomNorm.includes(normalize(p.name_fr || '').split(' ')[0])
    );
    if (inBasket) return { ...ing, source: 'basket' };

    // 2. Chercher dans le catalogue Goffa
    //    Priorité : product_id déjà lié en BDD, sinon matching par nom
   const inCatalogue = ing.product_id
  ? catalogue.find(p => p.id === ing.product_id)
  : catalogue.find(p => {
      const nomProduit = normalize(p.name_fr || '').split(' ');
      // Le PREMIER mot du produit doit matcher, pas n'importe quel mot
      return nomProduit[0] === nomNorm.split(' ')[0];
    });

    if (inCatalogue) {
      return {
        ...ing,
        source:       'catalogue',
        catalogue_id: inCatalogue.id,
        produit: {
          id:       inCatalogue.id,
          slug:     inCatalogue.slug     || null,
          name_fr:  inCatalogue.name_fr,
          images:   inCatalogue.images   || [],
          prix_min: inCatalogue.prix_min ? parseFloat(inCatalogue.prix_min) : null,
        },
      };
    }

    // 3. Introuvable
    return { ...ing, source: 'external' };
  });
};

// ─── Formater les étapes ─────────────────────────────────────────────────────
// RecipeStep → tableau de strings, comme Gemini le retourne
const formaterEtapes = (steps) =>
  steps
    .sort((a, b) => a.step_number - b.step_number)
    .map(s => s.instruction_fr);

// ─── Fallback principal ──────────────────────────────────────────────────────
export const fallbackRecipeService = async (panierAlimentaire, catalogue = []) => {
  // 1. Charger toutes les recettes publiées (sans ingrédients pour l'instant)
  const { recipes } = await Recipe.findAllPublic({ limit: 999 });

  if (!recipes.length) return null; // Aucune recette publiée → on ne peut rien faire

  // 2. Charger les ingrédients de chaque recette en parallèle
  const recipesAvecIngredients = await Promise.all(
    recipes.map(async (r) => {
      const ingredients = await RecipeIngredient.findByRecipeId(r.id);
      return { ...r, ingredients };
    })
  );

  // 3. Scorer et sélectionner la meilleure recette
// 3. Scorer et sélectionner la meilleure recette
const motsPanier = extraireMotsPanier(panierAlimentaire);

const scored = recipesAvecIngredients
  .map(r => ({ recette: r, score: scorerRecette(r.ingredients, motsPanier) }))
  .sort((a, b) => b.score - a.score);

console.log("[Fallback] scores:", scored.map(r => ({ titre: r.recette.title_fr, score: r.score })));

const scoreMax = scored[0].score;
const exAequo  = scored.filter(r => r.score === scoreMax);
const meilleure = exAequo[Math.floor(Math.random() * exAequo.length)].recette;
  // 4. Charger les étapes de la recette sélectionnée
  const steps = await RecipeStep.findByRecipeId(meilleure.id);

  // 5. Mapper les ingrédients → basket / catalogue / external
  const ingredientsMappés = mapperIngredients(
    meilleure.ingredients,
    panierAlimentaire,
    catalogue,
  );

  // 6. Retourner dans le même format que Gemini
  return {
    titre:       meilleure.title_fr,
    origine:     meilleure.category || 'Tunisie',
    description: meilleure.description_fr || '',
    emoji:       '🍽️',
    temps:       [meilleure.prep_time, meilleure.cook_time]
                   .filter(Boolean)
                   .join(' + ') || 'N/A',
    ingredients: ingredientsMappés,
    etapes:      formaterEtapes(steps),
    is_fallback: true, 
        fallback_message: "Notre assistante IA est temporairement indisponible. Voici une recette de notre plateforme. Réessayez dans quelques instants pour obtenir une recette entièrement personnalisée. 🍽️",  // ← ajouter
            // flag pour le frontend
    recipe_id:   meilleure.id,     // utile si tu veux linker vers /recettes/:slug
    recipe_slug: meilleure.slug,
  };
};