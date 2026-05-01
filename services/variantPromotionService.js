import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache } from "../utils/cacheInvalideation.js"; // ✅ ajout


export const getVariantPromotionsService = async (variantId) => {
  const result = await database.query(
    `SELECT * FROM variant_promotions
     WHERE variant_id = $1
     ORDER BY created_at DESC`,
    [variantId]
  );
  return result.rows;
};

export const createVariantPromotionService = async ({
  variantId, discount_type, discount_value, starts_at, expires_at,
}) => {
  if (!['percent', 'fixed'].includes(discount_type))
    throw new ErrorHandler("Type invalide.", 400);
  if (discount_type === 'percent' && (discount_value <= 0 || discount_value > 100))
    throw new ErrorHandler("Pourcentage entre 1 et 100.", 400);
  if (new Date(expires_at) <= new Date(starts_at))
    throw new ErrorHandler("expires_at doit être après starts_at.", 400);

  // Désactiver les promos actives existantes
  await database.query(
    `UPDATE variant_promotions SET is_active = false
     WHERE variant_id = $1 AND is_active = true`,
    [variantId]
  );

  const result = await database.query(
    `INSERT INTO variant_promotions
       (variant_id, discount_type, discount_value, starts_at, expires_at, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [variantId, discount_type, discount_value, starts_at, expires_at]
  );
  await invalidateOffresCache();
  return result.rows[0];
};

export const toggleVariantPromotionService = async (promoId, is_active) => {
  const result = await database.query(
    `UPDATE variant_promotions SET is_active = $1, updated_at = now()
     WHERE id = $2 RETURNING *`,
    [is_active, promoId]
  );
  if (result.rows.length === 0)
    throw new ErrorHandler("Promotion introuvable.", 404);
  await invalidateOffresCache();
  return result.rows[0];
};

export const deleteVariantPromotionService = async (promoId) => {
  const result = await database.query(
    "DELETE FROM variant_promotions WHERE id = $1 RETURNING id", [promoId]
  );
  if (result.rows.length === 0)
    throw new ErrorHandler("Promotion introuvable.", 404);
  await invalidateOffresCache();
};