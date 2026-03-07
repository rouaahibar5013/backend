import express from "express";
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  updatePassword,
} from "../controllers/authController.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

// ── Public (no login required) ───────────────────────────
router.post("/register", register);  // create account → sets cookie
router.post("/login",    login);     // login → sets cookie
router.post("/logout",   logout);    // logout → clears cookie

// ── Protected (login required) ───────────────────────────
router.get("/me",        isAuthenticated, getMe);            // get my profile
router.put("/me",        isAuthenticated, updateProfile);    // update name/avatar
router.put("/password",  isAuthenticated, updatePassword);   // change password

export default router;