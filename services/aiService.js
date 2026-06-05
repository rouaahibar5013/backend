// services/aiService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import Product  from '../models/Product.js';
import Category from '../models/Category.js';
import { fallbackLocalRecommandation } from './aiFallbackService.js';
import { jsonrepair } from "jsonrepair";
import { z }          from "zod";






const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 1 — Extraction des mots-clés (NLP léger côté Node)
// ═══════════════════════════════════════════════════════════════
const extraireMotsCles = (demande) => {
  const stopWords = new Set([
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
    'me', 'te', 'se', 'le', 'la', 'les', 'un', 'une', 'des',
    'du', 'de', 'et', 'ou', 'mais', 'donc', 'que', 'qui', 'quoi',
    'pour', 'par', 'sur', 'sous', 'avec', 'sans', 'dans', 'mon',
    'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ai',
    'est', 'sont', 'avoir', 'etre', 'au', 'aux', 'en', 'car',
    'quand', 'comme', 'plus', 'tres', 'tout', 'bien', 'pas',
    'ne', 'ni', 'ce', 'cet', 'cette', 'ces', 'jai', 'jme',
    'aussi', 'alors', 'apres', 'avant', 'chez', 'entre', 'lors',
    'meme', 'moins', 'peu', 'peut', 'puis', 'quels', 'quelle',
    'quel', 'quelque', 'souvent', 'toujours', 'veux', 'voudrais',
    'cherche', 'besoin', 'aide', 'merci', 'bonjour', 'stp', 'svp',
    'avoir', 'faire', 'aller', 'venir', 'prendre', 'trouver',
  ]);

  return demande
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8);
};

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 2 — Détection de l'intention catégorie
// ═══════════════════════════════════════════════════════════════
const INTENT_RULES = [
  {
    intent: 'cosmetics',
    keywords: [
      'visage', 'peau', 'creme', 'lotion', 'serum', 'masque', 'hydratant',
      'hydratante', 'soin', 'soins', 'corps', 'cheveux', 'shampoing',
      'demaquillant', 'exfoliant', 'baume', 'levres', 'ongles',
      'anti-age', 'antiage', 'rides', 'taches', 'acne', 'sebum', 'pores',
      'tonique', 'contour', 'yeux', 'solaire', 'spf', 'bronzant',
    ],
    // ⚠️ Adapter aux slugs réels de ta table category
    categorySlugs: ['cosmetiques', 'soins-visage', 'soins-corps', 'soins-cheveux'],
  },
  {
    intent: 'food',
    keywords: [
      'manger', 'cuisine', 'recette', 'alimentation', 'nourriture', 'repas',
      'petit-dejeuner', 'dejeuner', 'diner', 'gouter', 'snack', 'saveur',
      'gout', 'gastronomie', 'epicerie', 'conserve', 'sauce', 'confiture',
      'pate', 'cereales', 'legumineuses', 'farine', 'sucre', 'chocolat',
      'biscuit', 'boisson', 'jus', 'sirop',
    ],
    categorySlugs: ['alimentation', 'epicerie-fine', 'boissons', 'conserves', 'cereales'],
  },
  {
    intent: 'wellness',
    keywords: [
      'digestion', 'digestif', 'sommeil', 'stress', 'anxiete', 'fatigue',
      'immunite', 'detox', 'energie', 'vitalite', 'articulations', 'douleur',
      'inflammation', 'circulation', 'transit', 'cholesterol', 'glycemie',
      'tension', 'memoire', 'concentration', 'menopause', 'hormones', 'cycle',
      'fertilite', 'libido', 'tisane', 'infusion', 'huile', 'complement',
      'vitamines', 'mineraux', 'probiotiques', 'omega', 'adaptogene',
      'plante', 'herbe', 'epice', 'miel', 'propolis', 'gelee', 'pollen', 'spiruline',
    ],
    categorySlugs: ['bien-etre', 'tisanes', 'huiles', 'epices', 'miels', 'complements'],
  },
];

const detectCategoryIntent = (demande) => {
  const normalized = demande
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let bestMatch = { intent: 'general', slugs: [], score: 0 };

  for (const rule of INTENT_RULES) {
    const matchCount = rule.keywords.filter(kw => normalized.includes(kw)).length;
    if (matchCount > bestMatch.score) {
      bestMatch = { intent: rule.intent, slugs: rule.categorySlugs, score: matchCount };
    }
  }

  return bestMatch;
};

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 3 — Résolution slugs → IDs catégories (DB)
// Inclut les sous-catégories enfants pour ne pas être trop restrictif
// ═══════════════════════════════════════════════════════════════
const resoudreCategorieIds = async (categorySlugs) => {
  if (!categorySlugs || categorySlugs.length === 0) return null;

  try {
    const toutesCategories = await Category.findAll({ activeOnly: true });

    const parentIds = toutesCategories
      .filter(c => categorySlugs.includes(c.slug))
      .map(c => c.id);

    if (parentIds.length === 0) return null;

    const tousIds = toutesCategories
      .filter(c => parentIds.includes(c.id) || parentIds.includes(c.parent_id))
      .map(c => c.id);

    return tousIds.length > 0 ? tousIds : null;
  } catch (err) {
    console.warn('[AIService] Résolution catégories échouée :', err.message);
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 4 — Réduction du catalogue pour Gemini
//
// FIX #4 — ai_score inclus : signal de pertinence DB pour Gemini.
// Gemini peut l'utiliser comme indice sans l'imposer comme vérité.
// On N'envoie PAS : prix, stock, images, promotions.
// ═══════════════════════════════════════════════════════════════
const reduireCatalogueForGemini = (produits) =>
  produits.map(p => ({
    id:          p.id,
    slug:        p.slug,
    nom:         p.nom,
    description: p.description || '',
    ingredients: p.ingredients || '',
    categorie:   p.categorie   || '',
    ai_score: parseFloat((parseFloat(p.ai_score) || 0).toFixed(2)),
  }));


const GeminiResponseSchema = z.object({
  message: z.string().min(1),
  suggestion: z.string().default(''),
  produits_recommandes: z.array(z.object({
    id:     z.string(),
    slug:   z.string(),
    score:  z.number(),
    raison: z.string(),
  })).min(1),
});


// ═══════════════════════════════════════════════════════════════
// ÉTAPE 5 — Appel Gemini avec JSON structuré natif
//
// FIX #6 — responseMimeType: "application/json"
// Gemini garantit un JSON valide sans markdown ni backticks.
// Le try/catch reste comme filet de sécurité ultime.

// ═══════════════════════════════════════════════════════════════
const appellerGemini = async (demandeUser, catalogueReduit) => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
    },
    systemInstruction: `You are Liza, a highly experienced natural wellness and artisanal products advisor working for GOFFA.
Your mission is to understand the customer's real needs, symptoms, goals, preferences, or concerns, and recommend the most relevant products from the provided catalog.

CATALOG RESTRICTIONS:
- Recommend ONLY products that exist in the provided catalog.
- NEVER invent products, ingredients, categories, IDs, slugs, or any information.
- The "id" and "slug" fields MUST be copied character-for-character from the catalog.
- If a catalog product's id or slug is modified even slightly, it is considered an error.
- If no perfect match exists, recommend the closest products and explain the limitation honestly.

RECOMMENDATION QUALITY:
- Focus on solving the customer's actual need, not on promoting popular or featured products.
- Analyze the customer's intent carefully, even if expressed emotionally or indirectly.
- Recommend between 3 and 5 products — never more, never less (unless catalog has fewer).
- Avoid recommending external-use products unless the customer explicitly asks.
- If the request is vague, recommend versatile products and explain why.

AI_SCORE FIELD:
- Each product has an "ai_score" field (0 to 1) calculated by our search engine.
- Use it as a relevance signal to help prioritize — but not as absolute truth.
- A high ai_score means the product closely matches the customer's keywords.
- You may override it if you have strong semantic reasons.

SCORING AND RANKING:
- Assign a relevance score from 0 to 100 for each recommended product.
- 90-100: perfect match. 70-89: strong match. 50-69: partial match.
- Sort results by score descending — highest score FIRST. Mandatory.
- Every product MUST have a different score — no duplicates.

REASONING RULES:
- Explain specifically why each product matches THIS customer's request.
- Mention concrete ingredients, benefits, or properties from the catalog.
- Avoid generic phrases. Never copy descriptions verbatim.

CATEGORY AWARENESS:
- NEVER recommend food products for skincare requests or vice versa.
- Cross-category only when clearly complementary.

COMMUNICATION STYLE:
- Always respond in French. Be warm and professional.
- Never make medical diagnoses or claim products cure diseases.

OUTPUT: Return ONLY valid JSON matching exactly the requested structure.`,
  });

  const prompt = `CUSTOMER REQUEST:
"${demandeUser}"

AVAILABLE PRODUCTS (${catalogueReduit.length} products, pre-filtered for relevance):
${JSON.stringify(catalogueReduit, null, 2)}

TASK:
Think step by step before selecting any product:

STEP 1 — ANALYSE THE NEED:
What is the customer's primary need?
What symptom, goal or concern is expressed?
Is the request vague or specific?

STEP 2 — FILTER THE CATALOG:
Which products are semantically related to this need?
Which categories are relevant or irrelevant?
Which products have a high ai_score AND are semantically coherent?

STEP 3 — COMPARE AND RANK:
For each candidate product, why does it match better than the others?
Assign a unique score (0-100) justified by this reasoning.

STEP 4 — FINAL SELECTION:
Select the 3 to 5 best products based on steps 1-3.
Sort by score DESC.

Now produce the final JSON.
Write a short warm French introduction (1-2 sentences) in "message".
Write one practical follow-up question in "suggestion".
Write a specific French reason for each product in "raison".

Return ONLY this JSON:
{
  "message": "...",
  "produits_recommandes": [
    {
      "id": "exact id from catalog",
      "slug": "exact slug from catalog",
      "score": 95,
      "raison": "..."
    }
  ],
  "suggestion": "..."
}`;





  const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('Timeout IA (15s)')), ms))]);

const result = await withTimeout(model.generateContent(prompt), 15000);

const raw = result.response.text()
  .replace(/```json\n?/g, '')
  .replace(/```\n?/g, '')
  .trim();

try {
  return GeminiResponseSchema.parse(JSON.parse(jsonrepair(raw)));
} catch (parseError) {
  console.error('[AIService] Réponse Gemini invalide:', parseError.message);
  throw new Error('Réponse IA invalide');
}};



// ═══════════════════════════════════════════════════════════════
// ÉTAPE 6 — Validation stricte + déduplication
//
// FIX #1 — ID validé contre le catalogue envoyé à Gemini.
// FIX #2 — Paire (id + slug) vérifiée ensemble.
// FIX #3 — Doublons supprimés (première occurrence conservée).
// ═══════════════════════════════════════════════════════════════
const validerEtDedupliquer = (recommandations, catalogueReduit) => {
  // Source de vérité : id → slug du catalogue envoyé à Gemini
  const catalogueMap = new Map(
    catalogueReduit.map(p => [p.id, p.slug])
  );

  const idsVus = new Set();

  return recommandations.filter(rec => {
    // FIX #3 — Doublon
    if (idsVus.has(rec.id)) {
      console.warn(`[AIService] Doublon ignoré : "${rec.id}"`);
      return false;
    }

    // FIX #1 — ID hors catalogue (hallucination)
    if (!catalogueMap.has(rec.id)) {
      console.warn(`[AIService] ID halluciné ignoré : "${rec.id}"`);
      return false;
    }

    // FIX #2 — Slug incorrect pour cet ID
    if (catalogueMap.get(rec.id) !== rec.slug) {
      console.warn(`[AIService] Slug invalide pour "${rec.id}" : attendu "${catalogueMap.get(rec.id)}", reçu "${rec.slug}"`);
      return false;
    }

    idsVus.add(rec.id);
    return true;
  });
};

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 7 — Re-normalisation des scores côté backend
//
// Indépendant de Gemini. Recalcul linéaire [100 → 60] par rang.
// Garantit unicité, cohérence et plage prévisible.
// ═══════════════════════════════════════════════════════════════
const normaliserScores = (recommandes) => {
  const tries = [...recommandes].sort((a, b) => (b.score || 0) - (a.score || 0));
  const total  = tries.length;

  return tries.map((item, index) => ({
    ...item,
    score: total === 1
      ? 100
      : Math.round(100 - (index * 40 / (total - 1))),
  }));
};

// ═══════════════════════════════════════════════════════════════
// EXPORT PRINCIPAL — Orchestration complète
// ═══════════════════════════════════════════════════════════════
export const recommanderProduits = async (demande) => {

  // 1. Mots-clés
  const motsCles    = extraireMotsCles(demande);
  const searchQuery = motsCles.join(' ');

  // 2. Intention catégorie
  const { intent, slugs } = detectCategoryIntent(demande);
  console.info(`[AIService] Intent: ${intent} | Keywords: "${searchQuery || '(aucun)'}"`);

  // 3. IDs catégorie
  const categoryIds = intent !== 'general'
    ? await resoudreCategorieIds(slugs)
    : null;

  // 4. Recherche DB intelligente
  let catalogue = await Product.findForAI({
    keywords: searchQuery ? [searchQuery] : null,
    categoryIds,
    limit: 60,
  });

// Fallback 1 : sans filtre catégorie
if (catalogue.length < 3 && categoryIds) {
  catalogue = await Product.findForAI({
    keywords: searchQuery ? [searchQuery] : null,
    categoryIds: null,
    limit: 60,
  });
}

// Fallback 2 : catalogue général
if (catalogue.length < 3) {
  catalogue = await Product.findForAI({ limit: 60 });
}

// Fallback 3 : sans filtre strict (stock=0, inactifs inclus)
if (catalogue.length < 3) {  // ← changer === 0 par < 3
  catalogue = await Product.findForAI({ limit: 30, strict: false });
}

  // 7. Catalogue vide
 if (catalogue.length === 0) {
  return {
    message: "Je suis désolée, aucun produit n'est disponible pour le moment.",
    produits_recommandes: [],
    suggestion: '',
    total: 0,
  };
}

  // 8. Réduction pour Gemini (avec ai_score)
// 8. Réduction pour Gemini
  const catalogueReduit = reduireCatalogueForGemini(catalogue);

  // 9-11. Gemini + validation + scores  →  fallback si n'importe quoi échoue
  let recommandesFinales;
  let resultatGemini;

  try {
    resultatGemini = await appellerGemini(demande, catalogueReduit);

    const recommandesValidees = validerEtDedupliquer(
      resultatGemini.produits_recommandes || [],
      catalogueReduit
    );

    if (recommandesValidees.length === 0) {
      console.error('[AIService] Toutes les recommandations Gemini rejetées → fallback');
return fallbackLocalRecommandation(demande, catalogueReduit, { motsCles, categoryIds });    }

    recommandesFinales = normaliserScores(recommandesValidees);

 } catch (err) {
  return fallbackLocalRecommandation(demande, catalogueReduit, {
    erreur:      err,
    motsCles,        // déjà calculés étape 1
    categoryIds,     // déjà calculés étape 3
  });
}
  // 12. Enrichissement complet (batch + CTE promos)
  const ids              = recommandesFinales.map(p => p.id);
  const produitsComplets = await Product.findCompleteByIds(ids);

  // 13. Assemblage final
  const produits_recommandes = recommandesFinales
    .map(rec => {
      const complet = produitsComplets.find(p => p.id === rec.id);

      if (!complet) {
        console.warn(`[AIService] Produit introuvable après validation : "${rec.id}"`);
        return null;
      }

      return {
        id:             complet.id,
        name_fr:        complet.name_fr,
        description_fr: complet.description_fr,
        slug:           complet.slug,
        images:         complet.images,
        rating_avg:     parseFloat(complet.rating_avg)  || 0,
        rating_count:   parseInt(complet.rating_count)  || 0,
        is_new:         complet.is_new,
        is_featured:    complet.is_featured,
        categorie_fr:   complet.categorie_fr,
        prix_min:       complet.prix_min   ? parseFloat(complet.prix_min)   : null,
        prix_promo:     complet.prix_promo ? parseFloat(complet.prix_promo) : null,
        stock_total:    parseInt(complet.stock_total) || 0,
        score:          rec.score  || 0,
        raison_ia:      rec.raison || '',
      };
    })
    .filter(Boolean);

  return {
    message:             resultatGemini.message    || '',
    suggestion:          resultatGemini.suggestion || '',
    produits_recommandes,
    total:               produits_recommandes.length,
  };
};