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
// WEBHOOK STRIPE — raw body obligatoire
// ✅ DOIT être déclaré AVANT express.json() dans app.js
// ✅ Dans app.js : app.use('/api/orders/webhook', express.raw({ type: 'application/json' }))
// ═══════════════════════════════════════════════════════════
router.post("/webhook", stripeWebhook);

// ═══════════════════════════════════════════════════════════
// ROUTES PUBLIQUES
// ═══════════════════════════════════════════════════════════

// Frais de livraison en temps réel (GET /api/orders/shipping-cost?subtotal=XX)
router.get("/shipping-cost", getShippingCost);

// Validation code promo (checkout)
router.post("/validate-promo", validatePromo);

// Commande guest (non connecté)
router.post("/guest", createGuestOrder);

// Webhooks Odoo
router.post("/odoo/stock-update", odooStockUpdate);
router.post("/odoo/price-update", odooPriceUpdate);

// ═══════════════════════════════════════════════════════════
// ROUTES USER CONNECTÉ
// ═══════════════════════════════════════════════════════════

// Créer une commande
router.post("/", isAuthenticated, createOrder);

// Mes commandes
router.get("/my", isAuthenticated, getMyOrders);

// Détail d'une commande (user voit la sienne, admin voit toutes)
router.get("/:orderId", isAuthenticated, getSingleOrder);

// ═══════════════════════════════════════════════════════════
// ROUTES ADMIN
// ═══════════════════════════════════════════════════════════

// Liste de toutes les commandes
router.get(
  "/",
  isAuthenticated,
   isAdmin,
  getAllOrders
);

// Mettre à jour le statut d'une commande
router.patch(
  "/:orderId/status",
  isAuthenticated,
   isAdmin,
  updateOrderStatus
);

// Annuler une commande (admin only — reason obligatoire)
router.patch(
  "/:orderId/cancel",
  isAuthenticated,
   isAdmin,
  cancelOrder
);

// Mettre à jour la livraison (carrier, tracking, estimated_date, status, notes)
router.patch(
  "/:orderId/delivery",
  isAuthenticated,
   isAdmin,
  updateDelivery
);

// Mettre à jour les infos de livraison (adresse)
router.put(
  "/:orderId/shipping",
  isAuthenticated,
   isAdmin,
  adminUpdateOrderShipping
);

// Produits en stock faible (dashboard)
router.get(
  "/admin/low-stock",
  isAuthenticated,
   isAdmin,
  getLowStockProducts
);

// Paramètres Odoo
router.get(
  "/odoo/settings",
  isAuthenticated,
   isAdmin,
  getOdooSettings
);

router.put(
  "/odoo/settings",
  isAuthenticated,
   isAdmin,
  updateOdooSettings
);

router.get(
  "/odoo/logs",
  isAuthenticated,
   isAdmin,
  getSyncLogs
);

export default router;