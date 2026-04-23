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
//
// Sécurisation : si le user est connecté (req.user existe),
// on prend son nom et email depuis le token — pas depuis le body.
// Un user connecté ne peut pas usurper l'identité d'un autre.
// ═══════════════════════════════════════════════════════════
export const askQuestion = catchAsyncErrors(async (req, res, next) => {
  const { question } = req.body;

  // Si connecté → forcer nom et email depuis le JWT
  // Si non connecté → prendre depuis le body (champs obligatoires)
  const user_name  = req.user ? req.user.name  : req.body.user_name;
  const user_email = req.user ? req.user.email : req.body.user_email;

  if (!user_name || !user_email) {
    return next(new ErrorHandler("Nom et email sont requis.", 400));
  }

  const data = await faqService.askQuestionService({
    userId:     req.user?.id || null,
    user_name,
    user_email,
    question,
  });

  // Message différent selon qu'une réponse automatique a été envoyée ou non
  const message = data.auto_answered
    ? "Bonne nouvelle ! Nous avons trouvé une réponse à votre question. Consultez votre email."
    : "Votre question a bien été envoyée. Nous vous répondrons par email dans les plus brefs délais.";

  res.status(201).json({
    success:      true,
    message,
    auto_answered: data.auto_answered,
    // On expose la FAQ matchée uniquement si auto-répondu
    // (utile pour le front : afficher "Voir FAQ correspondante")
    matched_faq:  data.auto_answered ? data.matched_faq : undefined,
    question:     data.question,
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
// GET /api/faqs/admin/questions?status=pending&matched=false&page=1
// ═══════════════════════════════════════════════════════════
export const adminGetQuestions = catchAsyncErrors(async (req, res, next) => {
  const { status, matched } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await faqService.adminGetQuestionsService({ status, matched, page });
  res.status(200).json({ success: true, ...data });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — RÉPONDRE À UNE QUESTION
// PATCH /api/faqs/admin/questions/:id/answer
//
// Body optionnel :
//   create_faq   : boolean — créer une FAQ depuis cette question
//   faq_category : string  — catégorie si create_faq = true
// ═══════════════════════════════════════════════════════════
export const adminAnswerQuestion = catchAsyncErrors(async (req, res, next) => {
  const { answer, create_faq, faq_category } = req.body;
  if (!answer) return next(new ErrorHandler("La réponse est requise.", 400));

  const data = await faqService.adminAnswerQuestionService({
    id: req.params.id,
    answer,
    create_faq:   !!create_faq,
    faq_category,
  });

  const message = create_faq && data.faq_created
    ? "Réponse envoyée et FAQ créée avec succès."
    : "Réponse envoyée par email au client.";

  res.status(200).json({
    success:     true,
    message,
    question:    data.question,
    faq_created: data.faq_created || null,
  });
});


// ═══════════════════════════════════════════════════════════
// ADMIN — LIER UNE QUESTION À UNE FAQ EXISTANTE
// PATCH /api/faqs/admin/questions/:id/link
// Body : { faq_id: "uuid" }
// ═══════════════════════════════════════════════════════════
export const adminLinkQuestionToFaq = catchAsyncErrors(async (req, res, next) => {
  const { faq_id } = req.body;
  if (!faq_id) return next(new ErrorHandler("faq_id est requis.", 400));

  const question = await faqService.adminLinkQuestionToFaqService({
    questionId: req.params.id,
    faqId:      faq_id,
  });

  res.status(200).json({
    success:  true,
    message:  "Question liée à la FAQ et réponse envoyée au client.",
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


// ═══════════════════════════════════════════════════════════
// ADMIN — STATS
// GET /api/faqs/admin/stats
// ═══════════════════════════════════════════════════════════
export const adminFaqStats = catchAsyncErrors(async (req, res, next) => {
  const stats = await faqService.adminFaqStatsService();
  res.status(200).json({ success: true, stats });
});