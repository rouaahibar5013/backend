import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";

// ─────────────────────────────────────────
// CREATE PROMOTION (admin only)
// POST /api/promotions
// ─────────────────────────────────────────
export const createPromotion = catchAsyncErrors(async (req, res, next) => {
  const {
    code,
    description_fr,
    description_ar,
    discount_type,
    discount_value,
    min_order_amount,
    starts_at,
    expires_at,
    max_uses,
    is_active,
  } = req.body;

  if (!code || !discount_type || !discount_value || !starts_at || !expires_at)
    return next(new ErrorHandler("Veuillez fournir tous les champs obligatoires.", 400));

  if (!["percent", "fixed"].includes(discount_type))
    return next(new ErrorHandler("discount_type doit être 'percent' ou 'fixed'.", 400));

  if (discount_type === "percent" && (discount_value <= 0 || discount_value > 100))
    return next(new ErrorHandler("Le pourcentage doit être entre 1 et 100.", 400));

  if (new Date(expires_at) <= new Date(starts_at))
    return next(new ErrorHandler("La date d'expiration doit être après la date de début.", 400));

  const existing = await database.query(
    "SELECT id FROM promotions WHERE UPPER(code) = UPPER($1)",
    [code]
  );
  if (existing.rows.length > 0)
    return next(new ErrorHandler("Ce code promo existe déjà.", 409));

  const result = await database.query(
    `INSERT INTO promotions
       (code, description_fr, description_ar, discount_type, discount_value,
        min_order_amount, starts_at, expires_at, max_uses, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      code.toUpperCase().trim(),
      description_fr   || null,
      description_ar   || null,
      discount_type,
      discount_value,
      min_order_amount || null,
      starts_at,
      expires_at,
      max_uses         || null,
      is_active !== undefined ? is_active : true,
    ]
  );

  res.status(201).json({
    success:   true,
    message:   "Promotion créée avec succès.",
    promotion: result.rows[0],
  });
});

// ─────────────────────────────────────────
// FETCH ALL PROMOTIONS (admin only)
// GET /api/promotions
// ─────────────────────────────────────────
export const fetchAllPromotions = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT * FROM promotions ORDER BY created_at DESC`
  );

  res.status(200).json({
    success:         true,
    totalPromotions: result.rows.length,
    promotions:      result.rows,
  });
});

// ─────────────────────────────────────────
// UPDATE PROMOTION (admin only)
// PUT /api/promotions/:promotionId
// ─────────────────────────────────────────
export const updatePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params;
  const {
    code,
    description_fr,
    description_ar,
    discount_type,
    discount_value,
    min_order_amount,
    starts_at,
    expires_at,
    max_uses,
    is_active,
  } = req.body;

  const existing = await database.query(
    "SELECT id FROM promotions WHERE id = $1",
    [promotionId]
  );
  if (existing.rows.length === 0)
    return next(new ErrorHandler("Promotion introuvable.", 404));

  if (code) {
    const duplicate = await database.query(
      "SELECT id FROM promotions WHERE UPPER(code) = UPPER($1) AND id != $2",
      [code, promotionId]
    );
    if (duplicate.rows.length > 0)
      return next(new ErrorHandler("Ce code promo est déjà utilisé.", 409));
  }

  if (discount_type && !["percent", "fixed"].includes(discount_type))
    return next(new ErrorHandler("discount_type doit être 'percent' ou 'fixed'.", 400));

  if (discount_type === "percent" && discount_value && (discount_value <= 0 || discount_value > 100))
    return next(new ErrorHandler("Le pourcentage doit être entre 1 et 100.", 400));

  if (starts_at && expires_at && new Date(expires_at) <= new Date(starts_at))
    return next(new ErrorHandler("La date d'expiration doit être après la date de début.", 400));

  const result = await database.query(
    `UPDATE promotions
     SET
       code             = COALESCE(UPPER($1), code),
       description_fr   = $2,
       description_ar   = $3,
       discount_type    = COALESCE($4, discount_type),
       discount_value   = COALESCE($5, discount_value),
       min_order_amount = $6,
       starts_at        = COALESCE($7, starts_at),
       expires_at       = COALESCE($8, expires_at),
       max_uses         = $9,
       is_active        = COALESCE($10, is_active),
       updated_at       = NOW()
     WHERE id = $11
     RETURNING *`,
    [
      code             ? code.trim() : null,
      description_fr   ?? null,
      description_ar   ?? null,
      discount_type    || null,
      discount_value   || null,
      min_order_amount ?? null,
      starts_at        || null,
      expires_at       || null,
      max_uses         ?? null,
      is_active !== undefined ? is_active : null,
      promotionId,
    ]
  );

  res.status(200).json({
    success:   true,
    message:   "Promotion mise à jour avec succès.",
    promotion: result.rows[0],
  });
});

// ─────────────────────────────────────────
// DELETE PROMOTION (admin only)
// DELETE /api/promotions/:promotionId
// ─────────────────────────────────────────
export const deletePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params;

  const existing = await database.query(
    "SELECT id FROM promotions WHERE id = $1",
    [promotionId]
  );
  if (existing.rows.length === 0)
    return next(new ErrorHandler("Promotion introuvable.", 404));

  await database.query("DELETE FROM promotions WHERE id = $1", [promotionId]);

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

  if (!code)
    return next(new ErrorHandler("Veuillez fournir un code promo.", 400));

  const result = await database.query(
    `SELECT
       id, code, description_fr, description_ar,
       discount_type, discount_value, min_order_amount,
       expires_at, max_uses, used_count
     FROM promotions
     WHERE UPPER(code) = UPPER($1)
     AND   is_active   = true
     AND   starts_at  <= NOW()
     AND   expires_at >= NOW()
     AND   (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Code promo invalide ou expiré.", 404));

  res.status(200).json({
    success:   true,
    message:   "Code promo valide.",
    promotion: result.rows[0],
  });
});