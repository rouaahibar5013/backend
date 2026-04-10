import express from "express";
import {
  getAllFaqs,
  searchFaqs,
  askQuestion,
  adminGetAllFaqs,
  adminCreateFaq,
  adminUpdateFaq,
  adminToggleFaq,
  adminDeleteFaq,
  adminGetQuestions,
  adminAnswerQuestion,
  adminDeleteQuestion,
} from "../controllers/faqController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── PUBLIC ────────────────────────────────────────────────
// GET  /api/faqs              → toutes les FAQs actives
// GET  /api/faqs/search?q=   → recherche
// POST /api/faqs/ask          → user pose une question
router.get("/search", searchFaqs);
router.post("/ask",   askQuestion);   // public — connecté ou non
router.get("/",       getAllFaqs);

// ── ADMIN — FAQs ─────────────────────────────────────────
// GET    /api/faqs/admin/all        → toutes les FAQs (actives + inactives)
// POST   /api/faqs/admin            → créer une FAQ
// PUT    /api/faqs/admin/:id        → modifier une FAQ
// PATCH  /api/faqs/admin/:id/toggle → activer/désactiver
// DELETE /api/faqs/admin/:id        → supprimer
router.get   ("/admin/all",          isAuthenticated, isAdmin, adminGetAllFaqs);
router.post  ("/admin",              isAuthenticated, isAdmin, adminCreateFaq);
router.put   ("/admin/:id",          isAuthenticated, isAdmin, adminUpdateFaq);
router.patch ("/admin/:id/toggle",   isAuthenticated, isAdmin, adminToggleFaq);
router.delete("/admin/:id",          isAuthenticated, isAdmin, adminDeleteFaq);

// ── ADMIN — Questions users ───────────────────────────────
// GET   /api/faqs/admin/questions              → liste questions reçues
// PATCH /api/faqs/admin/questions/:id/answer   → répondre
// DELETE/api/faqs/admin/questions/:id          → supprimer
router.get   ("/admin/questions",               isAuthenticated, isAdmin, adminGetQuestions);
router.patch ("/admin/questions/:id/answer",    isAuthenticated, isAdmin, adminAnswerQuestion);
router.delete("/admin/questions/:id",           isAuthenticated, isAdmin, adminDeleteQuestion);

export default router;