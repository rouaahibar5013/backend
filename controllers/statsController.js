import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import * as statsService from "../services/statsService.js";

// ═══════════════════════════════════════════════════════════
// GET DASHBOARD STATS
// GET /api/stats
// GET /api/stats?period=today
// GET /api/stats?period=7days
// GET /api/stats?period=30days
// GET /api/stats?period=year
// GET /api/stats?month=3&year=2026
// Requires: isAuthenticated + isAdmin
// ═══════════════════════════════════════════════════════════
export const getStats = catchAsyncErrors(async (req, res, next) => {
  const { period, month, year } = req.query;

  const data = await statsService.getDashboardStatsService({
    period: period || '30days',
    month:  month  ? parseInt(month)  : null,
    year:   year   ? parseInt(year)   : null,
  });

  res.status(200).json({
    success: true,
    ...data,
  });
});

export const exportStats = catchAsyncErrors(async (req, res, next) => {
  const { period, month, year, type } = req.query;

  const { csv, filename } = await statsService.exportStatsService({
    period: period || '30days',
    month:  month ? parseInt(month) : null,
    year:   year  ? parseInt(year)  : null,
    type:   type  || 'orders',
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send('\uFEFF' + csv); // BOM pour Excel
});