import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair }         from "jsonrepair";
import { z }                  from "zod";
import Product                from "../models/Product.js";
import { fallbackRecipeService } from './fallbackRecipeService.js';


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: 2000
  }
});

// ─── Cache (TTL 30 min) ───────────────────────────────────
const cache     = new Map();
const CACHE_TTL = 1000 * 60 * 1;

const normalize = s =>
  s.toLowerCase()
   .normalize("NFD")
   .replace(/[\u0300-\u036f]/g, "")
   .trim();

// ─── Schéma Zod ───────────────────────────────────────────
//
// Changement majeur : plus de champ `suggestionGoffa` séparé.
// Chaque ingrédient porte maintenant sa propre source :
//
//   source = "basket"    → déjà dans le panier du client
//   source = "catalogue" → achetable sur Goffa (catalogue_id requis)
//   source = "external"  → nécessaire mais non disponible sur Goffa
//
// Avantage : une seule liste, le frontend peut afficher 3 états distincts
// sans fusionner plusieurs tableaux.
const IngredientSchema = z.object({
  nom:          z.string(),
  quantite:     z.string(),
  source:       z.enum(['basket', 'catalogue', 'external']),
  catalogue_id: z.string().optional(),
});

const RecetteSchema = z.object({
  titre:       z.string().min(1),
  origine:     z.string().min(1),
  description: z.string().min(1),
  emoji:       z.string(),
  temps:       z.string(),
  ingredients: z.array(IngredientSchema).min(1),
  etapes:      z.array(z.string()).min(1),
});

// ─── Service principal ────────────────────────────────────
//
// Architecture finale :
//
//   AVANT (plusieurs itérations) :
//     Panier → FTS similaires → Gemini → suggestionGoffa (liste séparée)
//     Problème : Parmesan/Basilic manquants, deux listes à gérer frontend
//
//   MAINTENANT :
//     Panier enrichi (nom + ingredients_fr + description_fr + catégorie)
//     + Catalogue top 100 alimentaires actifs/bien notés [{id, nom}]
//     → Gemini joue le rôle de chef : il choisit librement dans le catalogue
//     → Chaque ingrédient a une source (basket/catalogue/external)
//     → findCompleteByIds valide les IDs catalogue → 0 hallucination
//
// Paramètres :
//   panierAlimentaire : produits du panier filtrés (avec ingredients_fr, description_fr)
//   catalogue         : top 100 produits alimentaires actifs [{id, name_fr}]
export const suggererRecettesService = async (panierAlimentaire, catalogue = []) => {

  // ── Cache ─────────────────────────────────────────────
  const cacheKey = [...new Set(
    panierAlimentaire.map(p => normalize(p.name_fr)).filter(Boolean)
  )].sort().join('|');

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  // ── Panier enrichi → contexte culinaire réel pour Gemini ─
  // nom + categorie + ingredients_fr + description_fr
  // "Ras el Hanout" seul est ambigu ; avec ingredients_fr Gemini comprend
  // que c'est un mélange d'épices marocain → recette cohérente
  const basketPourGemini = panierAlimentaire.map(p => ({
    nom:         p.name_fr,
    categorie:   p.category_name  || '',
    ingredients: p.ingredients_fr || '',
    description: p.description_fr || '',
  }));

  // ── Catalogue → {id, nom} uniquement ─────────────────
  // Gemini n'a pas besoin des prix/images pour choisir des ingrédients.
  // Les IDs permettent la validation exacte côté backend (anti-hallucination).
  const cataloguePourGemini = catalogue.map(p => ({
    id:  p.id,
    nom: p.name_fr,
    ingredients: p.ingredients_fr || "",
     usage:       p.usage_fr || "",
  }));

  // ── Prompt ────────────────────────────────────────────
 const prompt = `You are an expert international chef and culinary assistant.

TASK:
Generate exactly ONE realistic recipe using the customer's basket as the foundation.
Think step by step before building the recipe:

STEP 1 — ANALYSE THE BASKET:
What are the main ingredients available?
What cuisine styles or dishes do they suggest?

STEP 2 — IDENTIFY GAPS:
What key ingredients are missing to complete a realistic recipe?
Which AVAILABLE_PRODUCTS could fill these gaps?

STEP 3 — BUILD THE RECIPE:
Choose one realistic dish based on steps 1 and 2.
Assign each ingredient its correct source (basket/catalogue/external).

STEP 4 — VALIDATE:
Does the recipe respect the 8 ingredient limit?
Are catalogue_ids copied exactly from AVAILABLE_PRODUCTS?

Now produce the final JSON.

BASKET:
${JSON.stringify(basketPourGemini)}

AVAILABLE_PRODUCTS:
Each product has: id, nom, ingredients, usage (how it's used in cooking).

${JSON.stringify(cataloguePourGemini)}

OUTPUT FORMAT:
{
  "titre": "",
  "origine": "",
  "description": "",
  "emoji": "",
  "temps": "",
  "ingredients": [
    {
      "nom": "Tomates",
      "quantite": "3",
      "source": "basket"
    },
    {
      "nom": "Parmesan",
      "quantite": "50g",
      "source": "catalogue",
      "catalogue_id": "uuid"
    },
    {
      "nom": "Sel",
      "quantite": "1 pincée",
      "source": "external"
    }
  ],
  "etapes": ["..."]
}`;
  try {

    const result = await model.generateContent(prompt);

    const raw = result.response.text()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // ── Validation Zod + jsonrepair ───────────────────────
    let recette;
    try {
      recette = RecetteSchema.parse(JSON.parse(jsonrepair(raw)));
    } catch (parseError) {
      console.error("[RecipeService] Réponse Gemini invalide:", parseError.message);
      throw new Error("Réponse IA invalide — réessayez.");
    }

    // ── Anti-hallucination : validation des catalogue_id ──
    //
    // Pour chaque ingrédient source=catalogue :
    //   1. Extraire le catalogue_id
    //   2. findCompleteByIds → recharge depuis PostgreSQL
    //   3. ID introuvable → Gemini a halluciné
    //      → source passe à "external", catalogue_id supprimé
    //   4. ID trouvé → ingrédient enrichi avec données complètes
    //
    // Résultat frontend :
    //   source=basket    → ✓  déjà dans ton panier
    //   source=catalogue → 🛒 achetable sur Goffa  + données produit complètes
    //   source=external  → ⚠  à acheter ailleurs
    const catalogueIngredients = recette.ingredients.filter(
      ing => ing.source === 'catalogue' && ing.catalogue_id
    );

    const catalogueIds    = catalogueIngredients.map(ing => ing.catalogue_id);
    const produitsEnrichis = catalogueIds.length > 0
      ? await Product.findCompleteByIds(catalogueIds)
      : [];

    const ingredientsFinaux = recette.ingredients.map(ing => {
      // Ingrédients basket et external → inchangés
      if (ing.source !== 'catalogue' || !ing.catalogue_id) return ing;

      const produit = produitsEnrichis.find(p => p.id === ing.catalogue_id);

      if (!produit) {
        // Hallucination Gemini — catalogue_id inexistant en BDD
        // On dégrade silencieusement en "external" pour ne pas planter le frontend
        console.warn(`[RecipeService] catalogue_id halluciné ignoré : "${ing.catalogue_id}"`);
        const { catalogue_id, ...rest } = ing;
        return { ...rest, source: 'external' };
      }

      // Ingrédient catalogue validé + enrichi avec données complètes
      return {
        ...ing,
        produit: {
          id:           produit.id,
          slug:         produit.slug,
          name_fr:      produit.name_fr,
          images:       produit.images,
          prix_min:     produit.prix_min   ? parseFloat(produit.prix_min)   : null,
          prix_promo:   produit.prix_promo ? parseFloat(produit.prix_promo) : null,
          rating_avg:   parseFloat(produit.rating_avg) || 0,
          categorie_fr: produit.categorie_fr,
        },
      };
    });

    const recetteFinale = {
      ...recette,
      ingredients: ingredientsFinaux,
    };

    cache.set(cacheKey, { data: recetteFinale, ts: Date.now() });
    return recetteFinale;

  } catch (error) {
    if (error.message.includes("Réponse IA invalide")) throw error;

    // Tous les cas Gemini (429, réseau, timeout...) → fallback
    console.warn("[RecipeService] Gemini indisponible → fallback BDD:", error.message);

    const recetteFallback = await fallbackRecipeService(panierAlimentaire, catalogue);
    if (!recetteFallback) throw new Error("Aucune recette disponible pour le moment.");

    cache.set(cacheKey, { data: recetteFallback, ts: Date.now() });
    return recetteFallback;
  }
};