import express from "express";
import {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  getAllReviews,
} from "../controllers/reviewController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────────
// Reviews d'un produit — page détail produit
router.get("/product/:productId",  getProductReviews);

// ── User connecté ────────────────────────────────────────────
// Soumettre une review
router.post("/",                   isAuthenticated, createReview);

// Modifier sa review
router.put("/:reviewId",           isAuthenticated, updateReview);

// Supprimer sa review
router.delete("/:reviewId",        isAuthenticated, deleteReview);

// ── Admin ────────────────────────────────────────────────────
// Toutes les reviews avec filtres rating + date
router.get("/",                    isAuthenticated, isAdmin, getAllReviews);

export default router;