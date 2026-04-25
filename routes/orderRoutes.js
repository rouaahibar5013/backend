import express from "express";
import {
  createOrder,
  createGuestOrder,
  stripeWebhook,
  getShippingCost,
  validatePromo,
  getMyOrders,
  getSingleOrder,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  updateDelivery,
  adminUpdateOrderShipping,
  getLowStockProducts,
  odooStockUpdate,
  odooPriceUpdate,
  getOdooSettings,
  updateOdooSettings,
  getSyncLogs,
} from "../controllers/orderController.js";

import {
  isAuthenticated,
  isAdmin,
} from "../middlewares/auth.js";

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// ⚠️  RÈGLE CRITIQUE — ORDRE DES ROUTES
// Les routes statiques DOIVENT être avant /:orderId
// ═══════════════════════════════════════════════════════════

// ── 1. WEBHOOK STRIPE ───────────────────────────────────
router.post("/webhooks/stripe", stripeWebhook);

// ── 2. ROUTES PUBLIQUES ─────────────────────────────────
router.get("/shipping-cost",   getShippingCost);
router.post("/validate-promo", validatePromo);
router.post("/guest",          createGuestOrder);

// ── 3. ODOO WEBHOOKS ────────────────────────────────────
router.post("/odoo/stock-update", odooStockUpdate);
router.post("/odoo/price-update", odooPriceUpdate);

// ── 4. ADMIN — routes statiques ──────────────────────────
router.get("/admin/low-stock", isAuthenticated, isAdmin, getLowStockProducts);
router.get("/odoo/settings",   isAuthenticated, isAdmin, getOdooSettings);
router.put("/odoo/settings",   isAuthenticated, isAdmin, updateOdooSettings);
router.get("/odoo/logs",       isAuthenticated,isAdmin, getSyncLogs);

// ── 5. USER CONNECTÉ — routes statiques ─────────────────
router.post("/",    isAuthenticated, createOrder);
router.get("/my",   isAuthenticated, getMyOrders);
router.get("/all",  isAuthenticated, isAdmin, getAllOrders);

// ── 6. ROUTES DYNAMIQUES (/:orderId) — EN DERNIER ───────
router.get(    "/:orderId",          isAuthenticated,                        getSingleOrder);
router.patch(  "/:orderId/status",   isAuthenticated, isAdmin, updateOrderStatus);
router.patch(  "/:orderId/cancel",   isAuthenticated, isAdmin, cancelOrder);
router.patch(  "/:orderId/delivery", isAuthenticated, isAdmin, updateDelivery);
router.put(    "/:orderId/shipping", isAuthenticated, isAdmin, adminUpdateOrderShipping);

export default router;