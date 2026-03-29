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
  stripeWebhook,           // ← Add this import
  getLowStockProducts,
  adminUpdateOrderShipping, 
} from "../controllers/orderController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public (webhooks Odoo — sécurisés par token Odoo) ────
router.post("/webhooks/odoo/stock-update", odooStockUpdate);
router.post("/webhooks/odoo/price-update", odooPriceUpdate);

// ── Guest ─────────────────────────────────────────────────
router.post("/guest", createGuestOrder);

// ── Client connecté ───────────────────────────────────────
router.post("/",                         isAuthenticated, createOrder);
router.get("/my",                        isAuthenticated, getMyOrders);
router.get("/:orderId",                  isAuthenticated, getSingleOrder);
router.patch("/:orderId/cancel",         isAuthenticated, cancelOrder);
router.post("/:orderId/stripe/confirm",  isAuthenticated, confirmStripePayment);

// ── Admin ─────────────────────────────────────────────────
// Low stock (admin)
router.get("/admin/low-stock", isAuthenticated, isAdmin, getLowStockProducts);
router.get("/",                          isAuthenticated, isAdmin, getAllOrders);
router.patch("/:orderId/status",         isAuthenticated, isAdmin, updateOrderStatus);
router.patch("/:orderId/delivery",       isAuthenticated, isAdmin, updateDelivery);

// ── Admin — Odoo settings ─────────────────────────────────
router.get("/odoo/settings",             isAuthenticated, isAdmin, getOdooSettings);
router.put("/odoo/settings",             isAuthenticated, isAdmin, updateOdooSettings);
router.get("/odoo/logs",                 isAuthenticated, isAdmin, getSyncLogs);


// ⚠️ Webhook Stripe doit être AVANT express.json() dans app.js
router.post("/webhooks/stripe", express.raw({type: 'application/json'}), stripeWebhook);


router.put(
  "/:orderId/shipping",
  isAuthenticated,
  isAdmin,
  adminUpdateOrderShipping
);

export default router;