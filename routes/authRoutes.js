import express from "express";
import passport from "../config/passport.js";
import {
  register,
  login,
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
} from "../controllers/authController.js";

import { isAuthenticated , isAdmin  } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────
router.post("/register",    register);       // create account → sends verification email
router.post("/login",       login);          // login → sets cookie
router.post("/logout",      logout);         // logout → clears cookie
router.post("/complete-account/:token", completeAccount);

// ── Email Verification ───────────────────────────────────
router.get("/verify-email/:token", verifyEmail); // user clicks link in email

// ── Forgot / Reset Password ──────────────────────────────
router.post("/forgot-password",          forgotPassword);  // sends reset email
router.post("/reset-password/:token",    resetPassword);   // sets new password


//  renvoyer le lien de vérification
router.post("/resend-verification", resendVerification);
// ── Google OAuth ─────────────────────────────────────────
// Step 1: redirect user to Google login page
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Step 2: Google redirects back here with the user info
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: `${process.env.FRONTEND_URL}/login`, session: false }),
  googleCallback
);

// ── Protected ────────────────────────────────────────────
router.get("/me",       isAuthenticated, getMe);
router.put("/me",       isAuthenticated, updateProfile);
router.put("/password", isAuthenticated, updatePassword);


router.get("/users",                isAuthenticated, isAdmin, getAllUsers);
router.delete("/users/:userId",     isAuthenticated, isAdmin, deleteUser);
router.patch("/users/:userId/role", isAuthenticated, isAdmin, updateUserRole);
router.patch("/users/:userId/suspend",  isAuthenticated, isAdmin, suspendUser);
router.patch("/users/:userId/activate", isAuthenticated, isAdmin, activateUser);
router.put("/users/:userId", isAuthenticated, isAdmin, adminUpdateUser);

export default router;