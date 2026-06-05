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
  adminLinkQuestionToFaq,  // nouveau
  adminDeleteQuestion,
  adminFaqStats,           // nouveau
} from "../controllers/faqController.js";
import { isAuthenticated, isAdmin , optionalAuth} from "../middlewares/auth.js";

const router = express.Router();


// ── PUBLIC ────────────────────────────────────────────────────────────────────

// GET  /api/faqs              → toutes les FAQs actives (triées par fréquence)
// GET  /api/faqs/search?q=    → recherche Full-Text + trigramme
// POST /api/faqs/ask          → poser une question (connecté ou non)

router.get ("/search", searchFaqs);
router.post("/ask", optionalAuth,   askQuestion);  // public — isAuthenticated optionnel en amont
router.get ("/",       getAllFaqs);


// ── ADMIN — Stats (AVANT /admin/all pour éviter conflit) ─────────────────────

// GET /api/faqs/admin/stats   → métriques dashboard
router.get("/admin/stats", isAuthenticated, isAdmin, adminFaqStats);


// ── ADMIN — FAQs ──────────────────────────────────────────────────────────────

// GET    /api/faqs/admin/all  → toutes les FAQs (actives + inactives)
// POST   /api/faqs/admin      → créer une FAQ
router.get ("/admin/all", isAuthenticated, isAdmin, adminGetAllFaqs);
router.post("/admin",     isAuthenticated, isAdmin, adminCreateFaq);


// ── ADMIN — Questions users (AVANT /admin/:id pour éviter conflit) ────────────

// GET    /api/faqs/admin/questions                    → liste paginée
//        ?status=pending|answered|closed
//        ?matched=true|false
//        ?page=1
// PATCH  /api/faqs/admin/questions/:id/answer         → répondre manuellement
//        body: { answer, create_faq?, faq_category? }
// PATCH  /api/faqs/admin/questions/:id/link           → lier à une FAQ existante
//        body: { faq_id }
// DELETE /api/faqs/admin/questions/:id                → supprimer une question

router.get   ("/admin/questions",             isAuthenticated, isAdmin, adminGetQuestions);
router.patch ("/admin/questions/:id/answer",  isAuthenticated, isAdmin, adminAnswerQuestion);
router.patch ("/admin/questions/:id/link",    isAuthenticated, isAdmin, adminLinkQuestionToFaq);
router.delete("/admin/questions/:id",         isAuthenticated, isAdmin, adminDeleteQuestion);


// ── ADMIN — Routes paramétriques FAQ (en dernier) ─────────────────────────────

// PUT    /api/faqs/admin/:id          → modifier une FAQ
// PATCH  /api/faqs/admin/:id/toggle   → activer / désactiver
// DELETE /api/faqs/admin/:id          → supprimer une FAQ

router.put   ("/admin/:id",         isAuthenticated, isAdmin, adminUpdateFaq);
router.patch ("/admin/:id/toggle",  isAuthenticated, isAdmin, adminToggleFaq);
router.delete("/admin/:id",         isAuthenticated, isAdmin, adminDeleteFaq);


export default router;