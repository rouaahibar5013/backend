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
router.get   ("/admin/all",          isAuthenticated, isAdmin, adminGetAllFaqs);
router.post  ("/admin",              isAuthenticated, isAdmin, adminCreateFaq);

// ── ADMIN — Questions users (AVANT /admin/:id) ────────────
router.get   ("/admin/questions",               isAuthenticated, isAdmin, adminGetQuestions);
router.patch ("/admin/questions/:id/answer",    isAuthenticated, isAdmin, adminAnswerQuestion);
router.delete("/admin/questions/:id",           isAuthenticated, isAdmin, adminDeleteQuestion);

// ── Routes paramétriques en dernier ──────────────────────
router.put   ("/admin/:id",          isAuthenticated, isAdmin, adminUpdateFaq);
router.patch ("/admin/:id/toggle",   isAuthenticated, isAdmin, adminToggleFaq);
router.delete("/admin/:id",          isAuthenticated, isAdmin, adminDeleteFaq);
export default router;