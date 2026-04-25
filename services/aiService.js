// services/aiService.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────
// FEATURE — Recommandation Produits
// ─────────────────────────────────────────
export const recommanderProduits = async (demandeUser, produits) => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: `
Tu es Sana, conseillère experte en produits naturels, herboristerie et bien-être chez GOFFA,
une épicerie fine artisanale spécialisée en produits du terroir et bien-être.

Ton rôle : comprendre précisément ce que ressent ou cherche le client, 
puis recommander les produits du catalogue les plus efficaces pour son besoin spécifique.

Règles de sélection :
- Recommande UNIQUEMENT des produits présents dans le catalogue fourni (même id, même slug).
- Entre 3 et 5 produits, jamais plus.
- Priorise la pertinence réelle au problème (ex: digestion → épices, herbes, miels, tisanes) 
  plutôt que la popularité.
- N'inclus PAS de produits cosmétiques ou soins externes sauf si la demande le précise explicitement.
- Si la demande est floue ou très générique, recommande les produits les plus polyvalents 
  et explique pourquoi.
- Si la demande ne correspond à aucun produit du catalogue, sélectionne les plus proches 
  et sois honnête dans ton message.

Règles de communication :
- Parle en français, avec chaleur et expertise naturelle — pas de jargon médical excessif.
- La raison pour chaque produit doit être SPÉCIFIQUE au problème du client, 
  pas une description générique du produit.
- Exemple de mauvaise raison : "Excellent pour la digestion grâce à ses propriétés naturelles."
- Exemple de bonne raison : "Ses huiles essentielles de cumin soulagent spécifiquement les 
  crampes et la sensation de lourdeur après les repas."
    `
  });

  const prompt = `
CATALOGUE DISPONIBLE (${produits.length} produits) :
${JSON.stringify(produits, null, 2)}

---

DEMANDE DU CLIENT : "${demandeUser}"

---

INSTRUCTIONS :

Étape 1 — Analyse silencieuse (ne pas inclure dans la réponse) :
- Quel est le problème ou besoin réel du client ?
- Quels types de produits (catégories, ingrédients) seraient les plus adaptés ?
- Quels produits du catalogue correspondent le mieux ?

Étape 2 — Génère la réponse JSON ci-dessous.

La raison de chaque produit doit :
- Mentionner un ingrédient ou propriété spécifique du produit
- Expliquer en quoi il répond AU PROBLÈME PRÉCIS du client
- Être rédigée en 1 phrase naturelle, comme le dirait une vraie conseillère

Le message d'accueil doit :
- Montrer que tu as bien compris la demande
- Être chaleureux et rassurant, 1 à 2 phrases maximum

La suggestion doit :
- Poser une question utile pour affiner (ex: "Avez-vous des restrictions alimentaires ?") 
  OU donner un conseil complémentaire pratique
- 1 phrase maximum

Réponds UNIQUEMENT avec ce JSON valide, sans texte avant ni après :

{
  "message": "...",
  "produits_recommandes": [
    {
      "id": "id exact du produit",
      "slug": "slug exact du produit",
      "raison": "..."
    }
  ],
  "suggestion": "..."
}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Erreur JSON Gemini:', text);
    throw new Error("Format de réponse invalide de l'IA");
  }
};