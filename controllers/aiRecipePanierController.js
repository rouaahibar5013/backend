import { catchAsyncErrors } from '../middlewares/catchAsyncErrors.js';
import { suggererRecettesService } from '../services/aiRecipePanierService.js';
import db from '../database/db.js';

export const suggererRecettes = catchAsyncErrors(async (req, res) => {
    const { produits } = req.body;

    if (!produits || !Array.isArray(produits) || produits.length === 0) {
        return res.status(400).json({ message: 'Liste de produits manquante ou invalide.' });
    }

    const variantIds = produits.map(p => p.variant_id).filter(Boolean);

    const [{ rows: produitsAvecCategorie }, { rows: catalogue }] = await Promise.all([
        db.query(
            `SELECT DISTINCT p.name_fr, c.name_fr as category_name
             FROM products p
             JOIN product_variants pv ON pv.product_id = p.id
             JOIN categories c ON c.id = p.category_id
             WHERE pv.id = ANY($1) AND p.is_active = true`,
            [variantIds]
        ),
        db.query(
            `SELECT id, name_fr FROM products WHERE is_active = true LIMIT 50`
        )
    ]);

    const recettes = await suggererRecettesService(produitsAvecCategorie, catalogue);
    return res.status(200).json({ recettes });
});