import { Faq, FaqQuestion } from "../models/index.js";
import ErrorHandler  from "../middlewares/errorMiddleware.js";
import sendEmail     from "../utils/sendEmail.js";
import { notifyAdmins } from "../utils/websocket.js";


const VALID_CATEGORIES      = ['livraison', 'paiement', 'produits', 'retours', 'autre'];
const SIMILARITY_THRESHOLD  = 0.3;


// ─── Helper email ─────────────────────────────────────────
const sendAnswerEmail = async (toEmail, userName, question, answer) => {
  await sendEmail({
    to:      toEmail,
    subject: `✅ Réponse à votre question — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #166534;">Bonjour ${userName},</h2>
          <p>Nous avons répondu à votre question :</p>
          <div style="background: #e5e7eb; padding: 16px; border-radius: 8px; margin: 12px 0;">
            <p style="margin: 0; font-style: italic; color: #374151;">« ${question} »</p>
          </div>
          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #166534; margin: 12px 0;">
            <p style="margin: 0; color: #166534; font-weight: bold;">Notre réponse :</p>
            <p style="margin: 8px 0 0;">${answer}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            Vous avez d'autres questions ? Visitez notre page FAQ.
          </p>
        </div>
      </div>
    `,
  });
};


// ═══════════════════════════════════════════════════════════
// GET ALL ACTIVE FAQs (public)
// ═══════════════════════════════════════════════════════════
export const getAllFaqsService = async () => {
  return await Faq.findAllPublic();
};


// ═══════════════════════════════════════════════════════════
// SEARCH FAQs (public)
// ═══════════════════════════════════════════════════════════
export const searchFaqsService = async (q) => {
  if (!q || q.trim().length < 2)
    throw new ErrorHandler("Veuillez fournir au moins 2 caractères.", 400);

  return await Faq.search(q.trim(), SIMILARITY_THRESHOLD);
};


// ═══════════════════════════════════════════════════════════
// USER POSE UNE QUESTION (public)
// ═══════════════════════════════════════════════════════════
export const askQuestionService = async ({ userId, user_name, user_email, question }) => {
  if (!user_name || !user_email || !question)
    throw new ErrorHandler("Nom, email et question sont requis.", 400);

  if (question.trim().length < 10)
    throw new ErrorHandler("La question doit contenir au moins 10 caractères.", 400);

  const cleanQuestion = question.trim();
  const cleanName     = user_name.trim();
  const cleanEmail    = user_email.trim().toLowerCase();

  const matchedFaq = await Faq.findSimilar(cleanQuestion, SIMILARITY_THRESHOLD);

  // ── CAS 1 : match trouvé ────────────────────────────────
  if (matchedFaq) {
    await Faq.incrementFrequency(matchedFaq.id);

    const faqQuestion = await FaqQuestion.createAnswered({
      userId:    userId || null,
      user_name: cleanName,
      user_email: cleanEmail,
      question:  cleanQuestion,
      answer:    matchedFaq.answer_fr,
    });

    await FaqQuestion.linkToFaq(faqQuestion.id, matchedFaq.id, true);

    await sendAnswerEmail(cleanEmail, cleanName, cleanQuestion, matchedFaq.answer_fr)
      .catch(err => console.error("Auto-answer email error:", err.message));

    return {
      question:      faqQuestion,
      auto_answered: true,
      matched_faq:   {
        id:          matchedFaq.id,
        question_fr: matchedFaq.question_fr,
        category:    matchedFaq.category,
      },
    };
  }

  // ── CAS 2 : aucun match → en attente de l'admin ─────────
  const faqQuestion = await FaqQuestion.createPending({
    userId:     userId || null,
    user_name:  cleanName,
    user_email: cleanEmail,
    question:   cleanQuestion,
  });

  notifyAdmins({
    type:      "NEW_FAQ_QUESTION",
    id:        faqQuestion.id,
    user_name: cleanName,
    question:  cleanQuestion,
    message:   `❓ Nouvelle question de ${cleanName}`,
  });

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to:      adminEmail,
      subject: `❓ Nouvelle question FAQ — ${cleanName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">❓ Nouvelle question reçue</h2>
          </div>
          <div style="padding: 20px; background: #f9fafb; border-radius: 0 0 8px 8px;">
            <p><strong>De :</strong> ${cleanName} (${cleanEmail})</p>
            <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #166534;">
              <p style="margin: 0;">${cleanQuestion}</p>
            </div>
            <a href="${process.env.FRONTEND_URL}/admin#faq?tab=questions"
               style="display: inline-block; margin-top: 16px; background: #166534; color: white;
                      padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Répondre dans le dashboard →
            </a>
          </div>
        </div>
      `,
    }).catch(err => console.error("Admin notify email error:", err.message));
  }

  return { question: faqQuestion, auto_answered: false, matched_faq: null };
};


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL FAQs
// ═══════════════════════════════════════════════════════════
export const adminGetAllFaqsService = async () => {
  return await Faq.findAll();
};


// ═══════════════════════════════════════════════════════════
// ADMIN — CREATE FAQ
// ═══════════════════════════════════════════════════════════
export const adminCreateFaqService = async ({ category, question_fr, answer_fr, order_index }) => {
  if (!category || !VALID_CATEGORIES.includes(category))
    throw new ErrorHandler(`Catégorie invalide. Valeurs : ${VALID_CATEGORIES.join(', ')}`, 400);
  if (!question_fr || !answer_fr)
    throw new ErrorHandler("La question et la réponse sont requises.", 400);

  return await Faq.create({
    category, question_fr: question_fr.trim(),
    answer_fr: answer_fr.trim(), order_index: order_index || 0,
  });
};


// ═══════════════════════════════════════════════════════════
// ADMIN — UPDATE FAQ
// ═══════════════════════════════════════════════════════════
export const adminUpdateFaqService = async ({ id, category, question_fr, answer_fr, order_index, is_active }) => {
  const current = await Faq.findById(id);
  if (!current) throw new ErrorHandler("FAQ introuvable.", 404);

  return await Faq.update(id, {
    category:    category    || current.category,
    question_fr: question_fr || current.question_fr,
    answer_fr:   answer_fr   || current.answer_fr,
    order_index: order_index ?? current.order_index,
    is_active:   is_active   ?? current.is_active,
  });
};


// ═══════════════════════════════════════════════════════════
// ADMIN — TOGGLE FAQ
// ═══════════════════════════════════════════════════════════
export const adminToggleFaqService = async (id) => {
  const faq = await Faq.findById(id);
  if (!faq) throw new ErrorHandler("FAQ introuvable.", 404);

  return await Faq.toggle(id, !faq.is_active);
};


// ═══════════════════════════════════════════════════════════
// ADMIN — DELETE FAQ
// ═══════════════════════════════════════════════════════════
export const adminDeleteFaqService = async (id) => {
  const faq = await Faq.findById(id);
  if (!faq) throw new ErrorHandler("FAQ introuvable.", 404);

  await Faq.delete(id);
};


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL USER QUESTIONS
// ═══════════════════════════════════════════════════════════
export const adminGetQuestionsService = async ({ status, matched, page = 1 }) => {
  return await FaqQuestion.findAllAdmin({ status, matched, page });
};


// ═══════════════════════════════════════════════════════════
// ADMIN — RÉPONDRE À UNE QUESTION
// ═══════════════════════════════════════════════════════════
export const adminAnswerQuestionService = async ({ id, answer, create_faq, faq_category }) => {
  if (!answer || answer.trim().length < 5)
    throw new ErrorHandler("La réponse doit contenir au moins 5 caractères.", 400);

  const q = await FaqQuestion.findById(id);
  if (!q) throw new ErrorHandler("Question introuvable.", 404);

  if (q.status === 'answered')
    throw new ErrorHandler("Cette question a déjà été répondue.", 400);

  const cleanAnswer = answer.trim();
  let   newFaqId    = null;

  if (create_faq) {
    const category = faq_category && VALID_CATEGORIES.includes(faq_category)
      ? faq_category : 'autre';

    newFaqId = await Faq.createFromQuestion({
      category, question_fr: q.question, answer_fr: cleanAnswer,
    });

    await FaqQuestion.linkToFaq(id, newFaqId, false);
  }

  const updated = await FaqQuestion.markAnswered(id, cleanAnswer);

  await sendAnswerEmail(q.user_email, q.user_name, q.question, cleanAnswer)
    .catch(err => console.error("Answer email error:", err.message));

  return { question: updated, faq_created: create_faq ? newFaqId : null };
};


// ═══════════════════════════════════════════════════════════
// ADMIN — LIER UNE QUESTION À UNE FAQ EXISTANTE
// ═══════════════════════════════════════════════════════════
export const adminLinkQuestionToFaqService = async ({ questionId, faqId }) => {
  const q   = await FaqQuestion.findById(questionId);
  if (!q)   throw new ErrorHandler("Question introuvable.", 404);

  const faq = await Faq.findById(faqId);
  if (!faq) throw new ErrorHandler("FAQ introuvable.", 404);

  await Faq.incrementFrequency(faqId);
  await FaqQuestion.linkToFaq(questionId, faqId, false);

  const updated = await FaqQuestion.markAnswered(questionId, faq.answer_fr);

  await sendAnswerEmail(q.user_email, q.user_name, q.question, faq.answer_fr)
    .catch(err => console.error("Link email error:", err.message));

  return updated;
};


// ═══════════════════════════════════════════════════════════
// ADMIN — DELETE USER QUESTION
// ═══════════════════════════════════════════════════════════
export const adminDeleteQuestionService = async (id) => {
  const q = await FaqQuestion.findById(id);
  if (!q) throw new ErrorHandler("Question introuvable.", 404);

  await FaqQuestion.delete(id);
};


// ═══════════════════════════════════════════════════════════
// ADMIN — STATS FAQ
// ═══════════════════════════════════════════════════════════
export const adminFaqStatsService = async () => {
  return await FaqQuestion.getStats();
};