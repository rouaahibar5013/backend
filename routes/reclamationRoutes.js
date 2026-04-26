import express from "express";
import {
  createGuestReclamation,
  createReclamation,
  getAllReclamations,
  getSingleReclamation,
  respondToReclamation,
  getEligibleOrders,
  getReclamationStats,
} from "../controllers/reclamationController.js";
import {
  isAuthenticated,
  isAdmin,
} from "../middlewares/auth.js";

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// ⚠️ Routes statiques AVANT /:id
// ═══════════════════════════════════════════════════════════
router.post("/guest", createGuestReclamation);  // ← nouvelle route, pas de isAuthenticated

// ── USER CONNECTÉ ────────────────────────────────────────
// Commandes éligibles pour le formulaire
router.get("/eligible-orders", isAuthenticated, getEligibleOrders);

// Créer une réclamation
router.post("/", isAuthenticated, createReclamation);

// ── ADMIN — routes statiques ─────────────────────────────
router.get(
  "/stats",
  isAuthenticated, isAdmin,
  getReclamationStats
);

router.get(
  "/",
  isAuthenticated, isAdmin,
  getAllReclamations
);

// ── ROUTES DYNAMIQUES (/:id) — EN DERNIER ────────────────
// Détail d'une réclamation (admin)
router.get(
  "/:id",
  isAuthenticated, isAdmin,
  getSingleReclamation
);

// Répondre à une réclamation (admin)
router.patch(
  "/:id/respond",
  isAuthenticated, isAdmin,
  respondToReclamation
);

export default router;