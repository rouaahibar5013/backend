import express from "express";
import {
  createOrder,
  createGuestOrder,
  confirmStripePayment,
  getMyOrders,
  getSingleOrder,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  updateDelivery,
  odooStockUpdate,
  odooPriceUpdate,
  getOdooSettings,
  updateOdooSettings,
  getSyncLogs,
  stripeWebhook,
  getLowStockProducts,
  adminUpdateOrderShipping,
  validatePromo,            // ← NEW
} from "../controllers/orderController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Webhooks publics ──────────────────────────────────────
router.post('/webhooks/stripe',            stripeWebhook);
router.post("/webhooks/odoo/stock-update", odooStockUpdate);
router.post("/webhooks/odoo/price-update", odooPriceUpdate);

// ── Guest ─────────────────────────────────────────────────
router.post("/guest", createGuestOrder);

// ── Validation code promo (public) ───────────────────────
router.post("/validate-promo", validatePromo);   // ← NEW — avant /:orderId

// ── Statiques admin — AVANT /:orderId ────────────────────
router.get("/admin/low-stock", isAuthenticated, isAdmin, getLowStockProducts);
router.get("/odoo/settings",   isAuthenticated, isAdmin, getOdooSettings);
router.get("/odoo/logs",       isAuthenticated, isAdmin, getSyncLogs);
router.put("/odoo/settings",   isAuthenticated, isAdmin, updateOdooSettings);

// ── Statiques client — AVANT /:orderId ───────────────────
router.get("/my",  isAuthenticated, getMyOrders);
router.post("/",   isAuthenticated, createOrder);
router.get("/",    isAuthenticated, isAdmin, getAllOrders);

// ── Dynamiques avec :orderId — EN DERNIER ─────────────────
router.get("/:orderId",                 isAuthenticated, getSingleOrder);
router.patch("/:orderId/cancel",        isAuthenticated, cancelOrder);
router.post("/:orderId/stripe/confirm", isAuthenticated, confirmStripePayment);
router.patch("/:orderId/status",        isAuthenticated, isAdmin, updateOrderStatus);
router.patch("/:orderId/delivery",      isAuthenticated, isAdmin, updateDelivery);
router.put("/:orderId/shipping",        isAuthenticated, isAdmin, adminUpdateOrderShipping);

export default router;