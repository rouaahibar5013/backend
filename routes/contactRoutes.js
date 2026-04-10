import express from "express";
import {
  createReclamation,
  getAllReclamations,
  updateStatus,
} from "../controllers/contactController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── PUBLIC ────────────────────────────────────────────────
// POST /api/contact/reclamation
router.post("/reclamation", createReclamation);

// ── ADMIN ─────────────────────────────────────────────────
// GET   /api/contact/reclamations
// PATCH /api/contact/reclamations/:id/status
router.get   ("/reclamations",             isAuthenticated, isAdmin, getAllReclamations);
router.patch ("/reclamations/:id/status",  isAuthenticated, isAdmin, updateStatus);

export default router;