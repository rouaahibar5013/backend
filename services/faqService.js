import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail    from "../utils/sendEmail.js";

// ═══════════════════════════════════════════════════════════
// HELPER — Email de réponse au user
// ═══════════════════════════════════════════════════════════
const sendAnswerEmail = async (toEmail, userName, question, answer) => {
  await sendEmail({
    to:      toEmail,
    subject: `✅ Réponse à votre question — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
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
  const result = await database.query(
    `SELECT id, category, question_fr, answer_fr, order_index
     FROM faqs
     WHERE is_active = true
     ORDER BY category, order_index ASC`
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// SEARCH FAQs (public)
// ═══════════════════════════════════════════════════════════
export const searchFaqsService = async (q) => {
  if (!q || q.trim().length < 2)
    throw new ErrorHandler("Veuillez fournir au moins 2 caractères.", 400);

  const result = await database.query(
    `SELECT id, category, question_fr, answer_fr
     FROM faqs
     WHERE is_active = true
     AND (
       question_fr ILIKE $1
       OR answer_fr ILIKE $1
     )
     ORDER BY order_index ASC`,
    [`%${q.trim()}%`]
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// USER POSE UNE QUESTION (public)
// ═══════════════════════════════════════════════════════════
export const askQuestionService = async ({ userId, user_name, user_email, question }) => {
  if (!user_name || !user_email || !question)
    throw new ErrorHandler("Nom, email et question sont requis.", 400);

  if (question.trim().length < 10)
    throw new ErrorHandler("La question doit contenir au moins 10 caractères.", 400);

  const result = await database.query(
    `INSERT INTO faq_questions (user_id, user_name, user_email, question)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId || null, user_name.trim(), user_email.trim(), question.trim()]
  );

  // Notifier l'admin
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to:      adminEmail,
      subject: `❓ Nouvelle question FAQ — ${user_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">❓ Nouvelle question reçue</h2>
          </div>
          <div style="padding: 20px; background: #f9fafb; border-radius: 0 0 8px 8px;">
            <p><strong>De :</strong> ${user_name} (${user_email})</p>
            <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #166534;">
              <p style="margin: 0;">${question}</p>
            </div>
            <a href="${process.env.FRONTEND_URL}/admin/faq"
               style="display: inline-block; margin-top: 16px; background: #166534; color: white;
                      padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Répondre dans le dashboard →
            </a>
          </div>
        </div>
      `,
    }).catch(err => console.error("Admin notify email error:", err.message));
  }

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL FAQs
// ═══════════════════════════════════════════════════════════
export const adminGetAllFaqsService = async () => {
  const result = await database.query(
    `SELECT * FROM faqs ORDER BY category, order_index ASC`
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// ADMIN — CREATE FAQ
// ═══════════════════════════════════════════════════════════
export const adminCreateFaqService = async ({ category, question_fr, answer_fr, order_index }) => {
  const validCategories = ['livraison','paiement','produits','retours','autre'];

  if (!category || !validCategories.includes(category))
    throw new ErrorHandler(`Catégorie invalide. Valeurs : ${validCategories.join(', ')}`, 400);
  if (!question_fr || !answer_fr)
    throw new ErrorHandler("La question et la réponse sont requises.", 400);

  const result = await database.query(
    `INSERT INTO faqs (category, question_fr, answer_fr, order_index)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [category, question_fr.trim(), answer_fr.trim(), order_index || 0]
  );
  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADMIN — UPDATE FAQ
// ═══════════════════════════════════════════════════════════
export const adminUpdateFaqService = async ({ id, category, question_fr, answer_fr, order_index }) => {
  const faq = await database.query("SELECT * FROM faqs WHERE id=$1", [id]);
  if (faq.rows.length === 0)
    throw new ErrorHandler("FAQ introuvable.", 404);

  const current = faq.rows[0];

  const result = await database.query(
    `UPDATE faqs
     SET category    = $1,
         question_fr = $2,
         answer_fr   = $3,
         order_index = $4,
         updated_at  = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      category    || current.category,
      question_fr || current.question_fr,
      answer_fr   || current.answer_fr,
      order_index ?? current.order_index,
      id,
    ]
  );
  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADMIN — TOGGLE FAQ (activer / désactiver)
// ═══════════════════════════════════════════════════════════
export const adminToggleFaqService = async (id) => {
  const faq = await database.query("SELECT is_active FROM faqs WHERE id=$1", [id]);
  if (faq.rows.length === 0)
    throw new ErrorHandler("FAQ introuvable.", 404);

  const newStatus = !faq.rows[0].is_active;

  const result = await database.query(
    "UPDATE faqs SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
    [newStatus, id]
  );
  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADMIN — DELETE FAQ
// ═══════════════════════════════════════════════════════════
export const adminDeleteFaqService = async (id) => {
  const faq = await database.query("SELECT id FROM faqs WHERE id=$1", [id]);
  if (faq.rows.length === 0)
    throw new ErrorHandler("FAQ introuvable.", 404);

  await database.query("DELETE FROM faqs WHERE id=$1", [id]);
};


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL USER QUESTIONS
// ═══════════════════════════════════════════════════════════
export const adminGetQuestionsService = async ({ status, page = 1 }) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (status) {
    conditions.push(`status=$${index}`);
    values.push(status);
    index++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);

  const [totalResult, result] = await Promise.all([
    database.query(
      `SELECT COUNT(*) FROM faq_questions ${whereClause}`,
      countValues
    ),
    database.query(
      `SELECT * FROM faq_questions
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    ),
  ]);

  return {
    total:      parseInt(totalResult.rows[0].count),
    totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit),
    page,
    questions:  result.rows,
  };
};


// ═══════════════════════════════════════════════════════════
// ADMIN — RÉPONDRE À UNE QUESTION
// ═══════════════════════════════════════════════════════════
export const adminAnswerQuestionService = async ({ id, answer }) => {
  if (!answer || answer.trim().length < 5)
    throw new ErrorHandler("La réponse doit contenir au moins 5 caractères.", 400);

  const faqQ = await database.query("SELECT * FROM faq_questions WHERE id=$1", [id]);
  if (faqQ.rows.length === 0)
    throw new ErrorHandler("Question introuvable.", 404);

  const q = faqQ.rows[0];

  if (q.status === 'answered')
    throw new ErrorHandler("Cette question a déjà été répondue.", 400);

  const result = await database.query(
    `UPDATE faq_questions
     SET answer      = $1,
         status      = 'answered',
         answered_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [answer.trim(), id]
  );

  // Envoyer email au user
  await sendAnswerEmail(q.user_email, q.user_name, q.question, answer.trim())
    .catch(err => console.error("Answer email error:", err.message));

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADMIN — DELETE USER QUESTION
// ═══════════════════════════════════════════════════════════
export const adminDeleteQuestionService = async (id) => {
  const q = await database.query("SELECT id FROM faq_questions WHERE id=$1", [id]);
  if (q.rows.length === 0)
    throw new ErrorHandler("Question introuvable.", 404);

  await database.query("DELETE FROM faq_questions WHERE id=$1", [id]);
};