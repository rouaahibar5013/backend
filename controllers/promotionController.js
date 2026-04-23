import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import {
  createPromotionService,
  fetchAllPromotionsService,
  updatePromotionService,
  deletePromotionService,
  validatePromoCodeService,
} from "../services/promotionService.js";

// ─────────────────────────────────────────
// CREATE PROMOTION (admin only)
// POST /api/promotions
// ─────────────────────────────────────────
export const createPromotion = catchAsyncErrors(async (req, res, next) => {
  const promotion = await createPromotionService(req.body, next);
  if (!promotion) return;

  res.status(201).json({
    success:   true,
    message:   "Promotion créée avec succès.",
    promotion,
  });
});

// ─────────────────────────────────────────
// FETCH ALL PROMOTIONS (admin only)
// GET /api/promotions
// ─────────────────────────────────────────
export const fetchAllPromotions = catchAsyncErrors(async (req, res, next) => {
  const promotions = await fetchAllPromotionsService();

  res.status(200).json({
    success:         true,
    totalPromotions: promotions.length,
    promotions,
  });
});

// ─────────────────────────────────────────
// UPDATE PROMOTION (admin only)
// PUT /api/promotions/:promotionId
// ─────────────────────────────────────────
export const updatePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params;
  const promotion = await updatePromotionService(promotionId, req.body, next);
  if (!promotion) return;

  res.status(200).json({
    success:   true,
    message:   "Promotion mise à jour avec succès.",
    promotion,
  });
});

// ─────────────────────────────────────────
// DELETE PROMOTION (admin only)
// DELETE /api/promotions/:promotionId
// ─────────────────────────────────────────
export const deletePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params;
  await deletePromotionService(promotionId, next);

  res.status(200).json({
    success: true,
    message: "Promotion supprimée avec succès.",
  });
});

// ─────────────────────────────────────────
// VALIDATE PROMO CODE (public)
// POST /api/promotions/validate
// body: { code }
// ─────────────────────────────────────────
export const validatePromoCode = catchAsyncErrors(async (req, res, next) => {
  const { code } = req.body;
  const promotion = await validatePromoCodeService(code, next);
  if (!promotion) return;

  res.status(200).json({
    success:   true,
    message:   "Code promo valide.",
    promotion,
  });
});