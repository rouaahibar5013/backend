import express from "express";
import {
  createOrder,
  createGuestOrder,
  confirmStripePayment,
  confirmPaypalPayment,
  getMyOrders,
  getSingleOrder,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  updateDelivery,
} from "../controllers/orderController.js";

import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();


router.post("/guest", createGuestOrder);


// ── Client (login required) ──────────────────────────────
router.post("/",                          isAuthenticated, createOrder);
router.get("/my",                         isAuthenticated, getMyOrders);
router.get("/:orderId",                   isAuthenticated, getSingleOrder);
router.patch("/:orderId/cancel",          isAuthenticated, cancelOrder);

// ── Payment confirmation ─────────────────────────────────
router.post("/:orderId/stripe/confirm",   isAuthenticated, confirmStripePayment);
router.post("/:orderId/paypal/confirm",   isAuthenticated, confirmPaypalPayment);

// ── Admin only ───────────────────────────────────────────
router.get("/",                           isAuthenticated, isAdmin, getAllOrders);
router.patch("/:orderId/status",          isAuthenticated, isAdmin, updateOrderStatus);
router.patch("/:orderId/delivery",        isAuthenticated, isAdmin, updateDelivery);

export default router;
