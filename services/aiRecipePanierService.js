const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

const cache = new Map();

export const suggererRecettesService = async (produits) => {
    const cacheKey = produits.map(p => p.product_name).filter(Boolean) .sort().join(',');
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const nomsProduits = produits
        .map(p => p.product_name)
        .filter(Boolean)
        .join(', ');

    const prompt = `
Tu es un assistant culinaire spécialisé dans la cuisine tunisienne et méditerranéenne.
Un client a dans son panier les produits artisanaux suivants : ${nomsProduits}.
Propose exactement 2 recettes réalisables avec tout ou partie de ces produits.
Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après, sans balises markdown.
Format exact :
[
  {
    "titre": "Nom de la recette",
    "description": "Une phrase courte et appétissante décrivant le plat",
    "ingredients": ["ingrédient 1", "ingrédient 2", "ingrédient 3"],
    "temps": "30 min",
    "emoji": "🍲"
  }
]
`;

    const geminiResponse = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
            },
        }),
    });

    if (!geminiResponse.ok) {
        const erreur = await geminiResponse.text();
        console.error('Erreur Gemini:', erreur);
        throw new Error('Erreur lors de la communication avec l\'IA.');
    }

    const data = await geminiResponse.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();

    const recettes = JSON.parse(clean);
    cache.set(cacheKey, recettes);
    return recettes;
};