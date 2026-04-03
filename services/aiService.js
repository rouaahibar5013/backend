import { GoogleGenerativeAI } from "@google/generative-ai";
import database from "../database/db.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════
// HELPER — Récupérer les produits GOFFA disponibles
// Pour que Gemini puisse suggérer des produits de la boutique
// ═══════════════════════════════════════════════════════════
const getGoffaProducts = async () => {
  const result = await database.query(
    `SELECT
       p.id,
       p.name_fr,
       p.slug,
       p.description_fr,
       p.ingredients_fr,
       p.usage_fr,
       c.name_fr AS category_name,
       (SELECT MIN(pv.price)
        FROM product_variants pv
        WHERE pv.product_id = p.id
        AND   pv.is_active  = true) AS price
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = true
     ORDER BY p.rating_avg DESC
     LIMIT 50`
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// RECIPE SUGGESTION SERVICE
// Génère 3 recettes tunisiennes basées sur les ingrédients
// du user + suggère des produits GOFFA complémentaires
// ═══════════════════════════════════════════════════════════
export const getRecipeSuggestionsService = async ({ ingredients, servings = 4 }) => {
  // ✅ Récupérer les produits GOFFA pour les suggestions
  const goffaProducts = await getGoffaProducts();

  const productsList = goffaProducts
    .map(p => `- ${p.name_fr} (${p.category_name}) — ${p.price} DT`)
    .join("\n");

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
Tu es un chef cuisinier expert en cuisine tunisienne et méditerranéenne bio.

L'utilisateur a ces ingrédients disponibles chez lui :
${ingredients.map(i => `- ${i}`).join("\n")}

Nombre de personnes : ${servings}

Voici les produits bio disponibles dans la boutique GOFFA que tu peux suggérer en complément :
${productsList}

Ta mission :
1. Génère EXACTEMENT 3 recettes tunisiennes authentiques adaptées aux ingrédients de l'utilisateur.
2. Pour chaque recette, suggère 1 à 3 produits GOFFA qui amélioreraient la recette.
3. Réponds UNIQUEMENT en JSON valide, sans texte avant ou après.

Format JSON requis :
{
  "recipes": [
    {
      "title": "Nom de la recette",
      "description": "Courte description appétissante (2 phrases max)",
      "difficulty": "facile" | "moyen" | "difficile",
      "prep_time": 15,
      "cook_time": 30,
      "servings": ${servings},
      "ingredients": [
        { "name": "Ingrédient", "quantity": "200g", "available": true },
        { "name": "Ingrédient GOFFA suggéré", "quantity": "2 cuillères", "available": false, "goffa_product": { "name": "Nom produit GOFFA", "slug": "slug-produit", "price": 12.5 } }
      ],
      "steps": [
        { "step": 1, "instruction": "Description de l'étape" }
      ],
      "chef_tip": "Conseil du chef"
    }
  ]
}

Règles importantes :
- available: true → ingrédient que l'user a déjà
- available: false → ingrédient suggéré depuis GOFFA
- Utilise UNIQUEMENT les produits de la liste GOFFA fournie
- Les recettes doivent être tunisiennes ou méditerranéennes
- Réponds en français uniquement
`;

  const result   = await model.generateContent(prompt);
  const response = result.response.text();

  // ✅ Nettoyer la réponse et parser le JSON
  const cleaned = response
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  // ✅ Enrichir les produits GOFFA avec les vraies données DB
  for (const recipe of parsed.recipes) {
    for (const ingredient of recipe.ingredients) {
      if (!ingredient.available && ingredient.goffa_product) {
        const dbProduct = goffaProducts.find(
          p => p.slug === ingredient.goffa_product.slug ||
               p.name_fr.toLowerCase().includes(ingredient.goffa_product.name.toLowerCase())
        );
        if (dbProduct) {
          ingredient.goffa_product = {
            id:    dbProduct.id,
            name:  dbProduct.name_fr,
            slug:  dbProduct.slug,
            price: dbProduct.price,
          };
        }
      }
    }
  }

  return parsed.recipes;
};


// ═══════════════════════════════════════════════════════════
// PRODUCT SEARCH SERVICE
// Recherche intelligente de produits par texte
// ═══════════════════════════════════════════════════════════
export const aiProductSearchService = async ({ query }) => {
  const goffaProducts = await getGoffaProducts();

  const productsList = goffaProducts
    .map(p => `ID:${p.id} | ${p.name_fr} | ${p.category_name} | ${p.price} DT | slug:${p.slug}`)
    .join("\n");

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
Tu es un assistant shopping expert en produits bio tunisiens pour la boutique GOFFA.

L'utilisateur cherche : "${query}"

Voici tous les produits disponibles :
${productsList}

Ta mission :
- Analyse l'intention de l'utilisateur
- Sélectionne les 6 produits les plus pertinents
- Si c'est une question générale, réponds aussi avec une explication

Réponds UNIQUEMENT en JSON valide :
{
  "answer": "Réponse générale si l'user pose une question (null sinon)",
  "product_ids": ["id1", "id2", "id3"],
  "reason": "Pourquoi ces produits correspondent à la recherche"
}
`;

  const result   = await model.generateContent(prompt);
  const response = result.response.text();

  const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed  = JSON.parse(cleaned);

  // ✅ Récupérer les vrais produits depuis la DB
  let products = [];
  if (parsed.product_ids && parsed.product_ids.length > 0) {
    const dbProducts = await database.query(
      `SELECT
         p.id, p.name_fr, p.slug, p.images, p.rating_avg,
         c.name_fr AS category_name,
         (SELECT MIN(pv.price) FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = true) AS price
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ANY($1) AND p.is_active = true`,
      [parsed.product_ids]
    );
    products = dbProducts.rows;
  }

  return {
    answer:   parsed.answer || null,
    reason:   parsed.reason,
    products,
  };
};


// ═══════════════════════════════════════════════════════════
// CHATBOT SERVICE
// Répond aux questions générales sur les produits bio
// ═══════════════════════════════════════════════════════════
export const aiChatService = async ({ message, history = [] }) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // ✅ Construire l'historique de conversation
  const chat = model.startChat({
    history: history.map(h => ({
      role:  h.role,
      parts: [{ text: h.content }],
    })),
    generationConfig: { maxOutputTokens: 500 },
  });

  const systemContext = `
Tu es l'assistant virtuel de GOFFA, une boutique en ligne de produits bio et artisanaux tunisiens.
Tu réponds en français uniquement.
Tu es expert en :
- Produits bio tunisiens (huiles, miels, épices, savons, cosmétiques naturels)
- Cuisine tunisienne et méditerranéenne
- Bienfaits des produits naturels
- Agriculture bio et artisanat tunisien

Si on te pose des questions hors sujet, réponds poliment que tu es spécialisé dans les produits bio tunisiens.
Sois chaleureux, professionnel et concis (3-4 phrases max par réponse).
`;

  const fullMessage = history.length === 0
    ? `${systemContext}\n\nQuestion: ${message}`
    : message;

  const result   = await chat.sendMessage(fullMessage);
  const response = result.response.text();

  return { reply: response };
};