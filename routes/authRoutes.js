// routes/authRoutes.js

import express   from "express";
import rateLimit from "express-rate-limit";

import {
  register, login, logout, verifyEmail,
  forgotPassword, resetPassword, getMe,
  updateMe, changePassword,
} from "../controllers/authController.js";

import { protect } from "../middlewares/auth.js";

import {
  validate,
  loginRules,
  registerRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
} from "../middlewares/validate.js";

const router = express.Router();

// ── Rate Limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { success: false, message: "Trop de tentatives. Réessayez dans 15 min." },
  standardHeaders: true,
  legacyHeaders:   false,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      3,
  message:  { success: false, message: "Trop de demandes. Réessayez dans 1 heure." },
});

// ── Routes publiques ──────────────────────────────────────────
router.post("/register",        authLimiter,  registerRules,       validate, register);
router.post("/login",           authLimiter,  loginRules,          validate, login);
router.get ("/verify-email",                                                  verifyEmail);
router.post("/forgot-password", resetLimiter, forgotPasswordRules, validate, forgotPassword);
router.post("/reset-password",                resetPasswordRules,  validate, resetPassword);

// ── Routes protégées ──────────────────────────────────────────
router.post("/logout",          protect,                                      logout);
router.get ("/me",              protect,                                      getMe);
router.put ("/me",              protect,                                      updateMe);
router.put ("/change-password", protect, changePasswordRules, validate,       changePassword);

export default router;