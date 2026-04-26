import express from "express";
import {
  getReviewableProducts,
  getMyReviews,
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  getAllReviews,
  approveReview,
} from "../controllers/reviewController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ══════════════════════════════════════════════════════
// ⚠️ ROUTES STATIQUES EN PREMIER — avant /:reviewId
// ══════════════════════════════════════════════════════

// ── Public ───────────────────────────────────────────
// Reviews d'un produit — page détail produit
router.get("/product/:productId",    getProductReviews);

// ── User connecté ────────────────────────────────────
// Produits qu'il peut noter (commandes livrées sans review)
router.get("/reviewable",            isAuthenticated, getReviewableProducts);

// Ses propres reviews
router.get("/my",                    isAuthenticated, getMyReviews);

// Soumettre une review
router.post("/",                     isAuthenticated, createReview);

// ── Admin — statiques EN PREMIER ─────────────────────
// Toutes les reviews avec filtres
router.get("/",                      isAuthenticated, isAdmin, getAllReviews);

// ══════════════════════════════════════════════════════
// ROUTES DYNAMIQUES /:reviewId — EN DERNIER
// ══════════════════════════════════════════════════════

// Modifier sa review (user) — seulement si pas approuvée
router.put("/:reviewId",             isAuthenticated, updateReview);

// Supprimer (user = seulement la sienne non approuvée | admin = n'importe laquelle)
router.delete("/:reviewId",          isAuthenticated, deleteReview);

// Approuver / Rejeter (admin)
router.patch("/:reviewId/approve",   isAuthenticated, isAdmin, approveReview);

export default router;