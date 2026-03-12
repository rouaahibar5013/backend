import express from "express";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  mergeCart,
  getAllCarts,
} from "../controllers/cartController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public (works for both logged-in and anonymous) ──────
router.get("/",              getCart);
router.post("/",             addToCart);
router.put("/:itemId",       updateCartItem);
router.delete("/:itemId",    removeFromCart);
router.delete("/",           clearCart);

// ── Logged-in user only ──────────────────────────────────
router.post("/merge",        isAuthenticated, mergeCart);

// ── Admin only ───────────────────────────────────────────
router.get("/all",           isAuthenticated, isAdmin, getAllCarts);

export default router;