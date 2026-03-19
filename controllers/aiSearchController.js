import { searchProductsByText } from '../services/aiSearchService.js'

export const aiTextSearch = async (req, res) => {
  try {
     console.log('Body:', req.body)        // ← ajoute ça
    console.log('Headers:', req.headers)
    const { description } = req.body

    if (!description || description.trim() === '') {
      return res.status(400).json({ message: 'Description requise' })
    }

    const result = await searchProductsByText(description)

    return res.status(200).json({
      success: true,
      understood: result.criteria,   // ce que l'IA a compris
      products: result.products,
      total: result.products.length
    })

  } catch (error) {
    console.error('AI Search error:', error.message) // ← change ça
    console.error('Stack:', error.stack)              // ← ajoute ça
    return res.status(500).json({ 
      message: 'Erreur serveur',
      error: error.message  // ← ajoute ça temporairement
    })
  }
}