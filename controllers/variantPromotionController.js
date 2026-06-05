import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as svc from "../services/variantPromotionService.js";

export const getVariantPromotions = catchAsyncErrors(async (req, res) => {
  const promotions = await svc.getVariantPromotionsService(req.params.variantId);
  res.status(200).json({ success: true, promotions });
});

export const createVariantPromotion = catchAsyncErrors(async (req, res, next) => {
  const { discount_type, discount_value, starts_at, expires_at } = req.body;
  if (!discount_value || !starts_at || !expires_at)
    return next(new ErrorHandler("discount_value, starts_at, expires_at requis.", 400));
  const promo = await svc.createVariantPromotionService({
    variantId: req.params.variantId,
    discount_type: discount_type || 'percent',
    discount_value: parseFloat(discount_value),
    starts_at, expires_at,
  });
  res.status(201).json({ success: true, promo });
});

export const toggleVariantPromotion = catchAsyncErrors(async (req, res) => {
  const promo = await svc.toggleVariantPromotionService(
    req.params.promoId,
    req.body.is_active
  );
  res.status(200).json({ success: true, promo });
});

export const deleteVariantPromotion = catchAsyncErrors(async (req, res) => {
  await svc.deleteVariantPromotionService(req.params.promoId);
  res.status(200).json({ success: true, message: "Promotion supprimée." });
});