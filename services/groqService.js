import groq from '../config/groq.js'

export const extractSearchCriteria = async (userDescription) => {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `Tu es un assistant e-commerce tunisien.
L'utilisateur décrit un produit qu'il cherche.
Extrait les critères de recherche et réponds UNIQUEMENT en JSON valide, sans texte supplémentaire :
{
  "keywords": "mots clés principaux en français",
  "price_max": null ou nombre,
  "price_min": null ou nombre,
  "category_name": null ou nom de catégorie en français
}`
      },
      {
        role: 'user',
        content: userDescription
      }
    ],
    temperature: 0.3,
    max_tokens: 200
  })

  const text = response.choices[0].message.content.trim()

  try {
    return JSON.parse(text)
  } catch {
    return { keywords: userDescription, price_max: null, price_min: null, category_name: null }
  }
}