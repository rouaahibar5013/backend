import express from "express";
import {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview,
  getAllReviews,
} from "../controllers/reviewController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────
router.get("/:productId",     getProductReviews);

// ── Client (login required) ──────────────────────────────
router.post("/:productId",    isAuthenticated, createReview);
router.put("/:reviewId",      isAuthenticated, updateReview);
router.delete("/:reviewId",   isAuthenticated, deleteReview);

// ── Admin only ───────────────────────────────────────────
router.get("/",               isAuthenticated, isAdmin, getAllReviews);

export default router;