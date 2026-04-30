import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail    from "../utils/sendEmail.js";


// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════

// Seuil de similarité trigramme : 0.0 = tout match, 1.0 = identique
// 0.3 = équilibre optimal : gère les fautes de frappe légères
//       sans faire de faux positifs ("livraison" ≠ "retour")
const SIMILARITY_THRESHOLD = 0.3;

const VALID_CATEGORIES = ['livraison', 'paiement', 'produits', 'retours', 'autre'];


// ═══════════════════════════════════════════════════════════
// HELPER PRIVÉ — Email de réponse au user
// ═══════════════════════════════════════════════════════════
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
// HELPER PRIVÉ — Recherche de FAQ similaire
// Retourne la FAQ la plus proche ou null
// ═══════════════════════════════════════════════════════════
const findSimilarFaq = async (question) => {
  // Étape 1 — Full-Text Search (rapide, utilise l'index GIN french existant)
  //   → détecte les questions sémantiquement proches ("livraison" = "livrer")
  // Étape 2 — Trigramme similarity() (pg_trgm)
  //   → détecte les fautes de frappe ("livrasion" ≈ "livraison")
  // On combine les deux avec OR pour maximiser les chances de match
  // On trie par similarité décroissante pour prendre le meilleur match
  const result = await database.query(
    `SELECT
       id,
       question_fr,
       answer_fr,
       category,
       similarity(question_fr, $1) AS score
     FROM faqs
     WHERE is_active = true
       AND (
         -- Full-Text Search : détecte la sémantique (mots racines)
         to_tsvector('french', question_fr) @@ plainto_tsquery('french', $1)
         OR
         -- Trigramme : détecte les fautes de frappe (caractères communs)
         similarity(question_fr, $1) > $2
       )
     ORDER BY score DESC
     LIMIT 1`,
    [question.trim(), SIMILARITY_THRESHOLD]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};


// ═══════════════════════════════════════════════════════════
// GET ALL ACTIVE FAQs (public) — triées par fréquence
// ═══════════════════════════════════════════════════════════
export const getAllFaqsService = async () => {
  // On utilise la vue faqs_public créée en migration
  // (ORDER BY frequency DESC, order_index ASC)
  const result = await database.query(
    `SELECT id, category, question_fr, answer_fr, order_index, frequency
     FROM faqs_public`
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// SEARCH FAQs (public) — Full-Text + trigramme
// ═══════════════════════════════════════════════════════════
export const searchFaqsService = async (q) => {
  if (!q || q.trim().length < 2)
    throw new ErrorHandler("Veuillez fournir au moins 2 caractères.", 400);

  const result = await database.query(
    `SELECT
       id, category, question_fr, answer_fr,
       similarity(question_fr, $1) AS score
     FROM faqs
     WHERE is_active = true
       AND (
         question_fr ILIKE $2
         OR answer_fr  ILIKE $2
         OR similarity(question_fr, $1) > $3
         OR to_tsvector('french', question_fr || ' ' || answer_fr)
            @@ plainto_tsquery('french', $1)
       )
     ORDER BY score DESC, order_index ASC`,
    [q.trim(), `%${q.trim()}%`, SIMILARITY_THRESHOLD]
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// USER POSE UNE QUESTION (public)
//
// LOGIQUE COMPLÈTE :
//   1. Valider les champs
//   2. Chercher une FAQ similaire (Full-Text + trigramme)
//   3a. MATCH → incrémenter frequency + stocker question liée
//             + répondre immédiatement au user par email
//   3b. PAS DE MATCH → stocker en pending + notifier admin
// ═══════════════════════════════════════════════════════════
export const askQuestionService = async ({ userId, user_name, user_email, question }) => {
  if (!user_name || !user_email || !question)
    throw new ErrorHandler("Nom, email et question sont requis.", 400);

  if (question.trim().length < 10)
    throw new ErrorHandler("La question doit contenir au moins 10 caractères.", 400);

  const cleanQuestion = question.trim();
  const cleanName     = user_name.trim();
  const cleanEmail    = user_email.trim().toLowerCase();

  const matchedFaq = await findSimilarFaq(cleanQuestion);

  // ── CAS 1 : match trouvé ────────────────────────────────
  if (matchedFaq) {
    await database.query(
      `SELECT increment_faq_frequency($1)`,
      [matchedFaq.id]
    );

    const result = await database.query(
      `INSERT INTO faq_questions
         (user_id, user_name, user_email, question, status, answer, answered_at)
       VALUES ($1, $2, $3, $4, 'answered', $5, NOW())
       RETURNING *`,
      [userId || null, cleanName, cleanEmail, cleanQuestion, matchedFaq.answer_fr]
    );

    await database.query(
      `INSERT INTO frequent_question (question_id, faq_id, matched_automatically)
       VALUES ($1, $2, TRUE)`,
      [result.rows[0].id, matchedFaq.id]
    );

    await sendAnswerEmail(cleanEmail, cleanName, cleanQuestion, matchedFaq.answer_fr)
      .catch(err => console.error("Auto-answer email error:", err.message));

    return {
      question:      result.rows[0],
      auto_answered: true,
      matched_faq:   {
        id:          matchedFaq.id,
        question_fr: matchedFaq.question_fr,
        category:    matchedFaq.category,
      },
    };
  }

  // ── CAS 2 : aucun match → en attente de l'admin ─────────
  const result = await database.query(
    `INSERT INTO faq_questions
       (user_id, user_name, user_email, question, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [userId || null, cleanName, cleanEmail, cleanQuestion]
  );

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

  return {
    question:      result.rows[0],
    auto_answered: false,
    matched_faq:   null,
  };
};

// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL FAQs
// ═══════════════════════════════════════════════════════════
export const adminGetAllFaqsService = async () => {
  const result = await database.query(
    `SELECT * FROM faqs ORDER BY frequency DESC, category, order_index ASC`
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// ADMIN — CREATE FAQ
// ═══════════════════════════════════════════════════════════
export const adminCreateFaqService = async ({ category, question_fr, answer_fr, order_index }) => {
  if (!category || !VALID_CATEGORIES.includes(category))
    throw new ErrorHandler(`Catégorie invalide. Valeurs : ${VALID_CATEGORIES.join(', ')}`, 400);
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
export const adminGetQuestionsService = async ({ status, matched, page = 1 }) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (status) {
    conditions.push(`fqq.status=$${index}`);
    values.push(status);
    index++;
  }

  if (matched !== undefined) {
    if (matched === 'true') {
      conditions.push(
        `EXISTS (SELECT 1 FROM frequent_question fq WHERE fq.question_id = fqq.id)`
      );
    } else {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM frequent_question fq WHERE fq.question_id = fqq.id)`
      );
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);

  const [totalResult, result] = await Promise.all([
    database.query(
      `SELECT COUNT(*)
       FROM faq_questions fqq
       ${whereClause}`,
      countValues
    ),
    database.query(
      `SELECT
         fqq.*,
         json_agg(
           json_build_object(
             'faq_id',                flink.faq_id,
             'matched_automatically', flink.matched_automatically,
             'faq_question',          f.question_fr,
             'faq_category',          f.category
           )
         ) FILTER (WHERE flink.faq_id IS NOT NULL) AS linked_faqs
       FROM faq_questions fqq
       LEFT JOIN frequent_question flink ON flink.question_id = fqq.id
       LEFT JOIN faqs f                  ON f.id = flink.faq_id
       ${whereClause}
       GROUP BY fqq.id
       ORDER BY fqq.created_at DESC
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
// ADMIN — RÉPONDRE À UNE QUESTION (manuelle)
// ═══════════════════════════════════════════════════════════
export const adminAnswerQuestionService = async ({ id, answer, create_faq, faq_category }) => {
  if (!answer || answer.trim().length < 5)
    throw new ErrorHandler("La réponse doit contenir au moins 5 caractères.", 400);

  const faqQ = await database.query("SELECT * FROM faq_questions WHERE id=$1", [id]);
  if (faqQ.rows.length === 0)
    throw new ErrorHandler("Question introuvable.", 404);

  const q = faqQ.rows[0];

  if (q.status === 'answered')
    throw new ErrorHandler("Cette question a déjà été répondue.", 400);

  const cleanAnswer = answer.trim();
  let   newFaqId    = null;

  if (create_faq) {
    const category = faq_category && VALID_CATEGORIES.includes(faq_category)
      ? faq_category
      : 'autre';

    const newFaq = await database.query(
      `INSERT INTO faqs (category, question_fr, answer_fr, order_index, frequency)
       VALUES ($1, $2, $3, 0, 1)
       RETURNING id`,
      [category, q.question, cleanAnswer]
    );
    newFaqId = newFaq.rows[0].id;

    await database.query(
      `INSERT INTO frequent_question (question_id, faq_id, matched_automatically)
       VALUES ($1, $2, FALSE)`,
      [id, newFaqId]
    );
  }

  const result = await database.query(
    `UPDATE faq_questions
     SET answer      = $1,
         status      = 'answered',
         answered_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [cleanAnswer, id]
  );

  await sendAnswerEmail(q.user_email, q.user_name, q.question, cleanAnswer)
    .catch(err => console.error("Answer email error:", err.message));

  return {
    question:    result.rows[0],
    faq_created: create_faq ? newFaqId : null,
  };
};
// ═══════════════════════════════════════════════════════════
// ADMIN — LIER UNE QUESTION À UNE FAQ EXISTANTE
// Nouveau endpoint : permet à l'admin de lier manuellement
// une question pending à une FAQ déjà existante
// ═══════════════════════════════════════════════════════════
export const adminLinkQuestionToFaqService = async ({ questionId, faqId }) => {
  const q = await database.query(
    "SELECT * FROM faq_questions WHERE id=$1", [questionId]
  );
  if (q.rows.length === 0)
    throw new ErrorHandler("Question introuvable.", 404);

  const faq = await database.query(
    "SELECT * FROM faqs WHERE id=$1", [faqId]
  );
  if (faq.rows.length === 0)
    throw new ErrorHandler("FAQ introuvable.", 404);

  await database.query(
    `SELECT increment_faq_frequency($1)`, [faqId]
  );

  await database.query(
    `INSERT INTO frequent_question (question_id, faq_id, matched_automatically)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (question_id, faq_id) DO NOTHING`,
    [questionId, faqId]
  );

  const result = await database.query(
    `UPDATE faq_questions
     SET answer      = $1,
         status      = 'answered',
         answered_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [faq.rows[0].answer_fr, questionId]
  );

  const question = q.rows[0];
  await sendAnswerEmail(
    question.user_email,
    question.user_name,
    question.question,
    faq.rows[0].answer_fr
  ).catch(err => console.error("Link email error:", err.message));

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


// ═══════════════════════════════════════════════════════════
// ADMIN — STATS FAQ
// Retourne les métriques utiles pour le dashboard
// ═══════════════════════════════════════════════════════════
export const adminFaqStatsService = async () => {
  const [counts, topFaqs] = await Promise.all([
    database.query(`
      SELECT
        COUNT(*)                                                            AS total,
        COUNT(*) FILTER (WHERE status = 'pending')                          AS pending,
        COUNT(*) FILTER (WHERE status = 'answered')                         AS answered,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM frequent_question fq
          WHERE fq.question_id = faq_questions.id
            AND fq.matched_automatically = TRUE
        ))                                                                  AS auto_answered,
        COUNT(*) FILTER (WHERE status = 'answered' AND EXISTS (
          SELECT 1 FROM frequent_question fq
          WHERE fq.question_id = faq_questions.id
            AND fq.matched_automatically = FALSE
        ))                                                                  AS manually_answered
      FROM faq_questions
    `),
    database.query(`
      SELECT id, category, question_fr, frequency
      FROM faqs
      WHERE is_active = true
      ORDER BY frequency DESC
      LIMIT 5
    `),
  ]);

  return {
    questions: counts.rows[0],
    top_faqs:  topFaqs.rows,
  };
};