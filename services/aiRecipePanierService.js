import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 600 }
});

const cache = new Map();

export const suggererRecettesService = async (produits, catalogue = []) => {
    const cacheKey = produits.map(p => p.name_fr).filter(Boolean).sort().join(',');
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const panier = produits.map(p => `${p.name_fr}(${p.category_name})`).join(',');
    const catalogueNoms = catalogue.slice(0, 50).map(p => p.name_fr).join(',');

    const prompt = `Chef international. Panier: ${panier}. Catalogue GOFFA: ${catalogueNoms}.
Si aucun aliment: {"non_alimentaire":true}
Sinon, 1 recette mondiale en JSON strict:
{"titre":"","origine":"🇯🇵 Japonaise","description":"","emoji":"","temps":"","ingredients":[{"nom":"","quantite":""}],"etapes":[""],"suggestionGoffa":["nom catalogue exact"]}`;

    try {
        const result = await model.generateContent(prompt);
        const recette = JSON.parse(result.response.text());

        if (recette.non_alimentaire) return null;

        const recetteAvecId = {
            ...recette,
            suggestionGoffa: (recette.suggestionGoffa || []).map(nom => {
                const produit = catalogue.find(p =>
                    p.name_fr.toLowerCase().includes(nom.toLowerCase()) ||
                    nom.toLowerCase().includes(p.name_fr.toLowerCase())
                );
                return { nom, slug: produit?.id || null };
            })
        };

        cache.set(cacheKey, recetteAvecId);
        return recetteAvecId;

    } catch (error) {
        console.error("Erreur SDK Gemini:", error);
        if (error.status === 429) throw new Error("Quota atteint. Réessayez dans une minute.");
        throw new Error("Erreur de communication avec l'IA.");
    }
};