// controllers/aiController.js
import catchAsyncErrors from '../middlewares/catchAsyncErrors.js';
import db from '../database/db.js';
import { recommanderProduits } from '../services/aiService.js';

// ─────────────────────────────────────────
// Récupérer produits légers depuis DB pour Gemini
// ─────────────────────────────────────────
const getProduitsForAI = async () => {
  const query = `
    SELECT 
      p.id,
      p.name_fr,
      p.description_fr,
      p.slug,
      c.name_fr AS categorie_fr
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = true
    ORDER BY p.is_featured DESC, p.rating_avg DESC
    LIMIT 150
  `;

  const { rows } = await db.query(query);

  return rows.map(p => ({
    id: p.id,
    slug: p.slug,
    nom: p.name_fr,
    description: (p.description_fr || '').substring(0, 220),
    categorie: p.categorie_fr,
  }));
};

// ─────────────────────────────────────────
// Récupérer données complètes par IDs
// ─────────────────────────────────────────
const getProduitsCompletsByIds = async (ids) => {
  if (!ids || ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    SELECT 
      p.id,
      p.name_fr,
      p.description_fr,
      p.slug,
      p.images,
      p.rating_avg,
      p.rating_count,
      p.is_new,
      p.is_featured,
      c.name_fr AS categorie_fr,
      MIN(pv.price) AS prix_min,
      COALESCE(SUM(pv.stock), 0) AS stock_total,
      (
        SELECT
          CASE
            WHEN vp.discount_type = 'percent'
              THEN ROUND(pv2.price * (1 - vp.discount_value / 100), 3)
            WHEN vp.discount_type = 'fixed'
              THEN GREATEST(pv2.price - vp.discount_value, 0)
          END
        FROM product_variants pv2
        JOIN variant_promotions vp ON vp.variant_id = pv2.id
        WHERE pv2.product_id = p.id
          AND pv2.is_active = true
          AND vp.is_active = true
          AND vp.starts_at <= NOW()
          AND vp.expires_at > NOW()
        ORDER BY pv2.price ASC
        LIMIT 1
      ) AS prix_promo
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variants pv 
      ON pv.product_id = p.id 
      AND pv.is_active = true
    WHERE p.id IN (${placeholders})
    AND p.is_active = true
    GROUP BY 
      p.id, p.name_fr, p.description_fr, p.slug,
      p.images, p.rating_avg, p.rating_count, p.is_new, p.is_featured,
      c.name_fr
  `;

  const { rows } = await db.query(query, ids);
  return rows;
};

// ─────────────────────────────────────────
// POST /api/ai/recommander
// ─────────────────────────────────────────
export const recommander = catchAsyncErrors(async (req, res) => {
  const { demande } = req.body;

  if (!demande || demande.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'La demande est trop courte.'
    });
  }

  if (demande.trim().length > 500) {
    return res.status(400).json({
      success: false,
      message: 'La demande est trop longue (max 500 caractères).'
    });
  }

  const produitsLegers = await getProduitsForAI();

  if (produitsLegers.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'Aucun produit disponible en stock pour le moment.',
      produits_recommandes: [],
      suggestion: ''
    });
  }

  const resultatGemini = await recommanderProduits(demande, produitsLegers);

  const ids = resultatGemini.produits_recommandes.map(p => p.id);
  const produitsComplets = await getProduitsCompletsByIds(ids);

  const produitsFinaux = resultatGemini.produits_recommandes.map(rec => {
    const complet = produitsComplets.find(p => p.id === rec.id);
    if (!complet) return null;
    return {
      id: complet.id,
      name_fr: complet.name_fr,
      description_fr: complet.description_fr,
      slug: complet.slug,
      images: complet.images,
      rating_avg: parseFloat(complet.rating_avg) || 0,
      rating_count: complet.rating_count,
      is_new: complet.is_new,
      is_featured: complet.is_featured,
      categorie_fr: complet.categorie_fr,
      prix_min: complet.prix_min ? parseFloat(complet.prix_min) : null,
      prix_promo: complet.prix_promo ? parseFloat(complet.prix_promo) : null,
      stock_total: parseInt(complet.stock_total),
      raison_ia: rec.raison
    };
  }).filter(Boolean);

  res.status(200).json({
    success: true,
    message: resultatGemini.message,
    suggestion: resultatGemini.suggestion,
    produits_recommandes: produitsFinaux,
    total: produitsFinaux.length
  });
});