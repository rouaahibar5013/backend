import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import {
  createPromotionService,
  fetchAllPromotionsService,
  updatePromotionService,
  deletePromotionService,
  validatePromoCodeService,
} from "../services/promotionService.js";

export const createPromotion = catchAsyncErrors(async (req, res) => {
  const promotion = await createPromotionService(req.body);
  res.status(201).json({ success: true, message: "Promotion créée avec succès.", promotion });
});

export const fetchAllPromotions = catchAsyncErrors(async (req, res) => {
  const promotions = await fetchAllPromotionsService();
  res.status(200).json({ success: true, totalPromotions: promotions.length, promotions });
});

export const updatePromotion = catchAsyncErrors(async (req, res) => {
  const promotion = await updatePromotionService(req.params.promotionId, req.body);
  res.status(200).json({ success: true, message: "Promotion mise à jour avec succès.", promotion });
});

export const deletePromotion = catchAsyncErrors(async (req, res) => {
  await deletePromotionService(req.params.promotionId);
  res.status(200).json({ success: true, message: "Promotion supprimée avec succès." });
});

export const validatePromoCode = catchAsyncErrors(async (req, res) => {
  const promotion = await validatePromoCodeService(req.body.code);
  res.status(200).json({ success: true, message: "Code promo valide.", promotion });
});