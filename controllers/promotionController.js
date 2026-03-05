import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
// ─────────────────────────────────────────
// CREATE PROMOTION (admin only)
// POST /api/promotions
// product_id is optional — if NULL the promo
// applies to all products
// ─────────────────────────────────────────
export const createPromotion = catchAsyncErrors(async (req, res, next) => {
  const { code, discount_percent, start_date, end_date, product_id } = req.body;

  if (!code || !discount_percent || !start_date || !end_date)
    return next(new ErrorHandler(" provide all promotion details.", 400));

  const existing = await database.query(
    "SELECT id FROM promotions WHERE code ILIKE $1", [code]
  );
  if (existing.rows.length > 0)
    return next(new ErrorHandler("Promotion code already exists.", 409));

  const promotion = await database.query(
    `INSERT INTO promotions (code, discount_percent, start_date, end_date, product_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [code.toUpperCase(), discount_percent, start_date, end_date, product_id || null]
  );

  res.status(201).json({
    success:   true,
    message:   "Promotion created successfully.",
    promotion: promotion.rows[0],
  });
});

// ─────────────────────────────────────────
// FETCH ALL PROMOTIONS (admin only)
// GET /api/promotions
// ─────────────────────────────────────────
export const fetchAllPromotions = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT pr.*, p.name AS product_name
     FROM promotions pr
     LEFT JOIN products p ON p.id = pr.product_id
     ORDER BY pr.created_at DESC`
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
  const { code, discount_percent, start_date, end_date, product_id } = req.body;

  const promotion = await database.query(
    "SELECT * FROM promotions WHERE id=$1", [promotionId]
  );
  if (promotion.rows.length === 0)
    return next(new ErrorHandler("Promotion not found.", 404));

  const result = await database.query(
    `UPDATE promotions
     SET code=$1, discount_percent=$2,
         start_date=$3, end_date=$4, product_id=$5
     WHERE id=$6 RETURNING *`,
    [code.toUpperCase(), discount_percent,
     start_date, end_date, product_id || null, promotionId]
  );

  res.status(200).json({
    success:   true,
    message:   "Promotion updated successfully.",
    promotion: result.rows[0],
  });
});

// ─────────────────────────────────────────
// DELETE PROMOTION (admin only)
// DELETE /api/promotions/:promotionId
// ─────────────────────────────────────────
export const deletePromotion = catchAsyncErrors(async (req, res, next) => {
  const { promotionId } = req.params;

  const promotion = await database.query(
    "SELECT * FROM promotions WHERE id=$1", [promotionId]
  );
  if (promotion.rows.length === 0)
    return next(new ErrorHandler("Promotion not found.", 404));

  await database.query("DELETE FROM promotions WHERE id=$1", [promotionId]);

  res.status(200).json({ success: true, message: "Promotion deleted successfully." });
});

// ─────────────────────────────────────────
// VALIDATE PROMO CODE (public)
// POST /api/promotions/validate
// body: { code: "SUMMER20" }
// User applies a code at checkout
// ─────────────────────────────────────────
export const validatePromoCode = catchAsyncErrors(async (req, res, next) => {
  const { code } = req.body;

  if (!code)
    return next(new ErrorHandler("Please provide a promo code.", 400));

  const result = await database.query(
    `SELECT * FROM promotions
     WHERE code ILIKE $1
     AND start_date <= NOW()
     AND end_date   >= NOW()`,
    [code]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Invalid or expired promo code.", 404));

  res.status(200).json({
    success:   true,
    message:   "Valid promo code.",
    promotion: result.rows[0],
  });
});