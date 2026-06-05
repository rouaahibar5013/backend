import { VariantPromotion } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache } from "../utils/cacheInvalideation.js";


export const getVariantPromotionsService = async (variantId) => {
  return await VariantPromotion.findByVariantId(variantId);
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

  await VariantPromotion.deactivateAllByVariantId(variantId);

  const promo = await VariantPromotion.create({
    variant_id: variantId, discount_type, discount_value, starts_at, expires_at,
  });

  await invalidateOffresCache();
  return promo;
};

export const toggleVariantPromotionService = async (promoId, is_active) => {
  const promo = await VariantPromotion.toggle(promoId, is_active);
  if (!promo)
    throw new ErrorHandler("Promotion introuvable.", 404);
  await invalidateOffresCache();
  return promo;
};

export const deleteVariantPromotionService = async (promoId) => {
  const deleted = await VariantPromotion.delete(promoId);
  if (!deleted)
    throw new ErrorHandler("Promotion introuvable.", 404);
  await invalidateOffresCache();
};