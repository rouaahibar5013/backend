import { Promotion } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache } from "../utils/cacheInvalideation.js";


// ─────────────────────────────────────────
// CREATE PROMOTION
// ─────────────────────────────────────────
export const createPromotionService = async (data) => {
  const {
    code, description_fr, discount_type, discount_value,
    min_order_amount, starts_at, expires_at, max_uses, is_active,
  } = data;

  if (!code || !discount_type || !discount_value || !starts_at || !expires_at)
    throw new ErrorHandler("Veuillez fournir tous les champs obligatoires.", 400);

  if (!["percent", "fixed"].includes(discount_type))
    throw new ErrorHandler("discount_type doit être 'percent' ou 'fixed'.", 400);

  if (discount_type === "percent" && (discount_value <= 0 || discount_value > 100))
    throw new ErrorHandler("Le pourcentage doit être entre 1 et 100.", 400);

  if (new Date(expires_at) <= new Date(starts_at))
    throw new ErrorHandler("La date d'expiration doit être après la date de début.", 400);

  const existing = await Promotion.findByCode(code.toUpperCase().trim());
  if (existing) throw new ErrorHandler("Ce code promo existe déjà.", 409);

  const promotion = await Promotion.create({
    code:             code.toUpperCase().trim(),
    description_fr:   description_fr   || null,
    discount_type,
    discount_value,
    min_order_amount: min_order_amount || null,
    starts_at,
    expires_at,
    max_uses:         max_uses         || null,
    is_active:        is_active !== undefined ? is_active : true,
  });

  await invalidateOffresCache();
  return promotion;
};


// ─────────────────────────────────────────
// FETCH ALL PROMOTIONS
// ─────────────────────────────────────────
export const fetchAllPromotionsService = async () => {
  return await Promotion.findAll();
};


// ─────────────────────────────────────────
// UPDATE PROMOTION
// ─────────────────────────────────────────
export const updatePromotionService = async (promotionId, data) => {
  const {
    code, description_fr, discount_type, discount_value,
    min_order_amount, starts_at, expires_at, max_uses, is_active,
  } = data;

  const current = await Promotion.findById(promotionId);
  if (!current) throw new ErrorHandler("Promotion introuvable.", 404);

  if (code) {
    const duplicate = await Promotion.findByCodeExcludingId(code.toUpperCase().trim(), promotionId);
    if (duplicate) throw new ErrorHandler("Ce code promo est déjà utilisé.", 409);
  }

  if (discount_type && !["percent", "fixed"].includes(discount_type))
    throw new ErrorHandler("discount_type doit être 'percent' ou 'fixed'.", 400);

  if (discount_type === "percent" && discount_value && (discount_value <= 0 || discount_value > 100))
    throw new ErrorHandler("Le pourcentage doit être entre 1 et 100.", 400);

  if (starts_at && expires_at && new Date(expires_at) <= new Date(starts_at))
    throw new ErrorHandler("La date d'expiration doit être après la date de début.", 400);

  const updated = await Promotion.updateFull(promotionId, {
    code:             code             ? code.trim()    : null,
    description_fr:   description_fr   ?? null,
    discount_type:    discount_type    || null,
    discount_value:   discount_value   || null,
    min_order_amount: min_order_amount ?? null,
    starts_at:        starts_at        || null,
    expires_at:       expires_at       || null,
    max_uses:         max_uses         ?? null,
    is_active:        is_active !== undefined ? is_active : null,
  });

  await invalidateOffresCache();
  return updated;
};


// ─────────────────────────────────────────
// DELETE PROMOTION
// ─────────────────────────────────────────
export const deletePromotionService = async (promotionId) => {
  const existing = await Promotion.findById(promotionId);
  if (!existing) throw new ErrorHandler("Promotion introuvable.", 404);

  await Promotion.delete(promotionId);
  await invalidateOffresCache();
};


// ─────────────────────────────────────────
// VALIDATE PROMO CODE
// ─────────────────────────────────────────
export const validatePromoCodeService = async (code) => {
  if (!code) throw new ErrorHandler("Veuillez fournir un code promo.", 400);

  const promotion = await Promotion.findValidByCode(code);
  if (!promotion) throw new ErrorHandler("Code promo invalide ou expiré.", 404);

  return promotion;
};