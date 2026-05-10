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
             FROM product p
             JOIN product_variant pv ON pv.product_id = p.id
             LEFT JOIN category c ON c.id = p.category_id
             WHERE pv.id = ANY($1) AND p.is_active = true`,
            [variantIds]
        ),
        db.query(
            `SELECT
                p.id,
                p.name_fr,
                p.is_featured,
                p.is_new,
                p.rating_avg,
                p.images,
                c.name_fr AS categorie_fr,
                MIN(pv.price)::numeric AS prix_min,
                MIN(
                    CASE
                        WHEN vp.discount_type = 'percent'
                            THEN ROUND(pv.price * (1 - vp.discount_value / 100), 2)
                        WHEN vp.discount_type = 'fixed'
                            THEN ROUND(pv.price - vp.discount_value, 2)
                    END
                )::numeric AS prix_promo
            FROM product p
            LEFT JOIN category c ON c.id = p.category_id
            LEFT JOIN product_variant pv ON pv.product_id = p.id AND pv.is_active = true
            LEFT JOIN variant_promotion vp
                ON vp.variant_id = pv.id
                AND vp.is_active = true
                AND now() BETWEEN vp.starts_at AND vp.expires_at
            WHERE p.is_active = true
            GROUP BY p.id, p.name_fr, p.is_featured, p.is_new, p.rating_avg, p.images, c.name_fr
            LIMIT 50`
        )
    ]);
    const recette = await suggererRecettesService(produitsAvecCategorie, catalogue);
    return res.status(200).json({ recette });
});