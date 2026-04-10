import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler          from "../middlewares/errorMiddleware.js";
import * as faqService       from "../services/faqService.js";


// ═══════════════════════════════════════════════════════════
// GET ALL ACTIVE FAQs
// GET /api/faqs
// ═══════════════════════════════════════════════════════════
export const getAllFaqs = catchAsyncErrors(async (req, res, next) => {
  const faqs = await faqService.getAllFaqsService();
  res.status(200).json({ success: true, total: faqs.length, faqs });
});


// ═══════════════════════════════════════════════════════════
// SEARCH FAQs
// GET /api/faqs/search?q=...
// ═══════════════════════════════════════════════════════════
export const searchFaqs = catchAsyncErrors(async (req, res, next) => {
  const { q } = req.query;
  if (!q) return next(new ErrorHandler("Veuillez fournir un terme de recherche.", 400));

  const faqs = await faqService.searchFaqsService(q);
  res.status(200).json({ success: true, total: faqs.length, faqs });
});


// ═══════════════════════════════════════════════════════════
// USER POSE UNE QUESTION
// POST /api/faqs/ask
// ═══════════════════════════════════════════════════════════
export const askQuestion = catchAsyncErrors(async (req, res, next) => {
  const { user_name, user_email, question } = req.body;

  const data = await faqService.askQuestionService({
    userId:     req.user?.id || null,
    user_name,
    user_email,
    question,
  });

  res.status(201).json({
    success: true,
    message: "Votre question a bien été envoyée. Nous vous répondrons par email dans les plus brefs délais.",
    question: data,
  });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL FAQs
// GET /api/faqs/admin/all
// ═══════════════════════════════════════════════════════════
export const adminGetAllFaqs = catchAsyncErrors(async (req, res, next) => {
  const faqs = await faqService.adminGetAllFaqsService();
  res.status(200).json({ success: true, total: faqs.length, faqs });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — CREATE FAQ
// POST /api/faqs/admin
// ═══════════════════════════════════════════════════════════
export const adminCreateFaq = catchAsyncErrors(async (req, res, next) => {
  const { category, question_fr, answer_fr, order_index } = req.body;

  const faq = await faqService.adminCreateFaqService({
    category, question_fr, answer_fr, order_index,
  });

  res.status(201).json({ success: true, message: "FAQ créée avec succès.", faq });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — UPDATE FAQ
// PUT /api/faqs/admin/:id
// ═══════════════════════════════════════════════════════════
export const adminUpdateFaq = catchAsyncErrors(async (req, res, next) => {
  const { category, question_fr, answer_fr, order_index } = req.body;

  const faq = await faqService.adminUpdateFaqService({
    id: req.params.id,
    category, question_fr, answer_fr, order_index,
  });

  res.status(200).json({ success: true, message: "FAQ mise à jour.", faq });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — TOGGLE FAQ (activer / désactiver)
// PATCH /api/faqs/admin/:id/toggle
// ═══════════════════════════════════════════════════════════
export const adminToggleFaq = catchAsyncErrors(async (req, res, next) => {
  const faq = await faqService.adminToggleFaqService(req.params.id);
  res.status(200).json({
    success: true,
    message: `FAQ ${faq.is_active ? 'activée' : 'désactivée'}.`,
    faq,
  });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — DELETE FAQ
// DELETE /api/faqs/admin/:id
// ═══════════════════════════════════════════════════════════
export const adminDeleteFaq = catchAsyncErrors(async (req, res, next) => {
  await faqService.adminDeleteFaqService(req.params.id);
  res.status(200).json({ success: true, message: "FAQ supprimée." });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL USER QUESTIONS
// GET /api/faqs/admin/questions
// ═══════════════════════════════════════════════════════════
export const adminGetQuestions = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await faqService.adminGetQuestionsService({ status, page });
  res.status(200).json({ success: true, ...data });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — RÉPONDRE À UNE QUESTION
// PATCH /api/faqs/admin/questions/:id/answer
// ═══════════════════════════════════════════════════════════
export const adminAnswerQuestion = catchAsyncErrors(async (req, res, next) => {
  const { answer } = req.body;
  if (!answer) return next(new ErrorHandler("La réponse est requise.", 400));

  const question = await faqService.adminAnswerQuestionService({
    id:     req.params.id,
    answer,
  });

  res.status(200).json({
    success:  true,
    message:  "Réponse envoyée par email au client.",
    question,
  });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — DELETE USER QUESTION
// DELETE /api/faqs/admin/questions/:id
// ═══════════════════════════════════════════════════════════
export const adminDeleteQuestion = catchAsyncErrors(async (req, res, next) => {
  await faqService.adminDeleteQuestionService(req.params.id);
  res.status(200).json({ success: true, message: "Question supprimée." });
});