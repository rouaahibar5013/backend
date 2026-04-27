import { catchAsyncErrors } from '../middlewares/catchAsyncErrors.js';
import { suggererRecettesService } from '../services/aiRecipePanierService.js';

export const suggererRecettes = catchAsyncErrors(async (req, res) => {
    const { produits } = req.body;

    if (!produits || !Array.isArray(produits) || produits.length === 0) {
        return res.status(400).json({ message: 'Liste de produits manquante ou invalide.' });
    }

    const recettes = await suggererRecettesService(produits);
    return res.status(200).json({ recettes });
});