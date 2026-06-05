import express from "express";
import passport from "../config/passport.js";
import {
  register,
  login,
  verifyMfa,
  logout,
  verifyEmail,
  googleCallback,
  forgotPassword,
  resetPassword,
  resendVerification,
  getMe,
  updateProfile,
  updatePassword,
  completeAccount,
  getAllUsers,
  deleteUser,
  updateUserRole,
  suspendUser,
  activateUser,
  adminUpdateUser,
  updateAddresses

} from "../controllers/authController.js";
import {
  loginLimiter,
  mfaLimiter,
  registerLimiter,
  forgotPasswordLimiter,
} from "../middlewares/rateLimiter.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────────────────────
router.post("/register",                registerLimiter,       register);
router.post("/login",                   loginLimiter,          login);
router.post("/login/verify-mfa",        mfaLimiter,            verifyMfa);
router.post("/logout",                                         logout);
router.post("/complete-account/:token", loginLimiter,          completeAccount);

// ── Email Verification ───────────────────────────────────────────────────
router.get("/verify-email/:token",                             verifyEmail);
router.post("/resend-verification",     forgotPasswordLimiter, resendVerification);

// ── Password ─────────────────────────────────────────────────────────────
router.post("/forgot-password",         forgotPasswordLimiter, forgotPassword);
router.post("/reset-password/:token",                          resetPassword);

// ── Google OAuth ─────────────────────────────────────────────────────────
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/connexion?error=suspended`,
    session: false,
  }),
  googleCallback
);

// ── Protected ─────────────────────────────────────────────────────────────
router.get("/me",      isAuthenticated,          getMe);
router.put("/me",      isAuthenticated,          updateProfile);
router.put("/password",isAuthenticated,          updatePassword);
router.put("/me/addresses", isAuthenticated, updateAddresses);

// ── Admin ─────────────────────────────────────────────────────────────────
router.get   ("/users",                  isAuthenticated, isAdmin, getAllUsers);
router.delete("/users/:userId",          isAuthenticated, isAdmin, deleteUser);
router.patch ("/users/:userId/role",     isAuthenticated, isAdmin, updateUserRole);
router.patch ("/users/:userId/suspend",  isAuthenticated, isAdmin, suspendUser);
router.patch ("/users/:userId/activate", isAuthenticated, isAdmin, activateUser);
router.put   ("/users/:userId",          isAuthenticated, isAdmin, adminUpdateUser);

export default router;