import database from "../database/db.js";

class FaqQuestion {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM faq_questions WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Créer une question auto-répondue ─────────────────
  static async createAnswered({ userId, user_name, user_email, question, answer }) {
    const result = await database.query(
      `INSERT INTO faq_questions
         (user_id, user_name, user_email, question, status, answer, answered_at)
       VALUES ($1, $2, $3, $4, 'answered', $5, NOW())
       RETURNING *`,
      [userId, user_name, user_email, question, answer]
    );
    return result.rows[0];
  }

  // ─── Créer une question en attente ────────────────────
  static async createPending({ userId, user_name, user_email, question }) {
    const result = await database.query(
      `INSERT INTO faq_questions
         (user_id, user_name, user_email, question, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [userId, user_name, user_email, question]
    );
    return result.rows[0];
  }

  // ─── Lier une question à une FAQ ─────────────────────
  static async linkToFaq(questionId, faqId, matchedAutomatically) {
    await database.query(
      `INSERT INTO frequent_question (question_id, faq_id, matched_automatically)
       VALUES ($1, $2, $3)
       ON CONFLICT (question_id, faq_id) DO NOTHING`,
      [questionId, faqId, matchedAutomatically]
    );
  }

  // ─── Marquer comme répondue ───────────────────────────
  static async markAnswered(id, answer) {
    const result = await database.query(
      `UPDATE faq_questions
       SET answer = $1, status = 'answered', answered_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [answer, id]
    );
    return result.rows[0];
  }

  // ─── Toutes les questions avec filtres (admin) ────────
  static async findAllAdmin({ status, matched, page = 1, limit = 10 } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = [];
    const values     = [];
    let   index      = 1;

    if (status) {
      conditions.push(`fqq.status = $${index}`);
      values.push(status); index++;
    }

    if (matched !== undefined) {
      if (matched === 'true') {
        conditions.push(`EXISTS (SELECT 1 FROM frequent_question fq WHERE fq.question_id = fqq.id)`);
      } else {
        conditions.push(`NOT EXISTS (SELECT 1 FROM frequent_question fq WHERE fq.question_id = fqq.id)`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countValues = [...values];
    values.push(limit, offset);

    const [totalResult, result] = await Promise.all([
      database.query(
        `SELECT COUNT(*) FROM faq_questions fqq ${whereClause}`, countValues
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
  }

  // ─── Stats dashboard ──────────────────────────────────
  static async getStats() {
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

    return { questions: counts.rows[0], top_faqs: topFaqs.rows };
  }

  // ─── Supprimer ────────────────────────────────────────
  static async delete(id) {
    await database.query("DELETE FROM faq_questions WHERE id = $1", [id]);
  }
}

export default FaqQuestion;