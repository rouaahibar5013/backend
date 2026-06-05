import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as offresService from "../services/offresService.js";

// ═══════════════════════════════════════════════════════════
// GET OFFRES DATA
// GET /api/offres
// Public — pas besoin d'être connecté
// ═══════════════════════════════════════════════════════════
export const getOffresData = catchAsyncErrors(async (req, res, next) => {
  const data = await offresService.getOffresDataService();

  res.status(200).json({
    success: true,
    ...data,
  });
});


// ═══════════════════════════════════════════════════════════
// VALIDATE PROMO CODE
// POST /api/offres/validate-promo
// Body: { code }
// Public — utilisé au checkout
// ═══════════════════════════════════════════════════════════
export const validatePromoCode = catchAsyncErrors(async (req, res, next) => {
  const { code } = req.body;

  if (!code)
    return next(new ErrorHandler("Veuillez fournir un code promo.", 400));

  const promo = await offresService.validatePromoCodeService(code);

  if (!promo)
    return next(new ErrorHandler("Code promo invalide ou expiré.", 400));

  res.status(200).json({
    success: true,
    promo,
  });
});