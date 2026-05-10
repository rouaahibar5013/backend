import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2000 }
});

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30;

export const suggererRecettesService = async (produits, catalogue = []) => {
    const cacheKey = produits.map(p => p.name_fr).filter(Boolean).sort().join(',');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const panier = produits.map(p => p.category_name ? `${p.name_fr}(${p.category_name})` : p.name_fr).join(',');
    const catalogueNoms = catalogue.slice(0, 50).map(p => p.name_fr).join(',');

    const prompt = `Tu es un chef cuisinier international. Voici les produits dans le panier d'un client: ${panier}. Catalogue GOFFA disponible: ${catalogueNoms}.
IMPORTANT: les produits artisanaux (épices, miels, huiles, confitures, céréales, légumineuses, herbes, condiments) sont TOUS considérés comme alimentaires.
Réponds UNIQUEMENT avec {"non_alimentaire":true} si le panier ne contient absolument aucun produit comestible (ex: textile, bijou, ustensile).
Sinon, génère 1 recette mondiale en JSON strict:
{"titre":"","origine":"🇯🇵 Japonaise","description":"","emoji":"","temps":"","ingredients":[{"nom":"","quantite":""}],"etapes":[""],"suggestionGoffa":["nom catalogue exact"]}`;

    try {
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const recette = JSON.parse(raw);

        if (recette.non_alimentaire) return null;

        const recetteAvecId = {
            ...recette,
            suggestionGoffa: (recette.suggestionGoffa || [])
                .map(nom => {
                    const produit = catalogue.find(p =>
                        p.name_fr.toLowerCase().includes(nom.toLowerCase()) ||
                        nom.toLowerCase().includes(p.name_fr.toLowerCase())
                    );
                    if (!produit) return null;
                    return {
                        ...produit,
                        raison_ia: `Complète parfaitement cette recette`
                    };
                })
                .filter(Boolean)
        };

        cache.set(cacheKey, { data: recetteAvecId, ts: Date.now() });
        return recetteAvecId;

    } catch (error) {
        console.error("Erreur SDK Gemini:", error);
        if (error.status === 429) throw new Error("Quota atteint. Réessayez dans une minute.");
        throw new Error("Erreur de communication avec l'IA.");
    }
};