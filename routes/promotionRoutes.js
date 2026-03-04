import express from "express";
import {
  createPromotion, fetchAllPromotions,
  updatePromotion, deletePromotion, validatePromoCode,
} from "../controllers/promotionController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────
router.post("/validate", validatePromoCode); // user applies code at checkout

// ── Admin only ───────────────────────────
router.get("/",                isAuthenticated, isAdmin, fetchAllPromotions);
router.post("/",               isAuthenticated, isAdmin, createPromotion);
router.put("/:promotionId",    isAuthenticated, isAdmin, updatePromotion);
router.delete("/:promotionId", isAuthenticated, isAdmin, deletePromotion);

export default router;