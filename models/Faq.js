import database from "../database/db.js";

class Faq {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM faqs WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Toutes les FAQs (admin) ──────────────────────────
  static async findAll() {
    const result = await database.query(
      "SELECT * FROM faqs ORDER BY frequency DESC, category, order_index ASC"
    );
    return result.rows;
  }

  // ─── FAQs publiques (vue) ─────────────────────────────
  static async findAllPublic() {
    const result = await database.query(
      `SELECT id, category, question_fr, answer_fr, order_index, frequency
       FROM faqs_public`
    );
    return result.rows;
  }

  // ─── Recherche Full-Text + trigramme ──────────────────
  static async search(q, threshold = 0.3) {
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
      [q, `%${q}%`, threshold]
    );
    return result.rows;
  }

  // ─── Trouver une FAQ similaire (auto-match) ───────────
  static async findSimilar(question, threshold = 0.3) {
    const result = await database.query(
      `SELECT
         id, question_fr, answer_fr, category,
         similarity(question_fr, $1) AS score
       FROM faqs
       WHERE is_active = true
         AND (
           to_tsvector('french', question_fr) @@ plainto_tsquery('french', $1)
           OR similarity(question_fr, $1) > $2
         )
       ORDER BY score DESC
       LIMIT 1`,
      [question.trim(), threshold]
    );
    return result.rows[0] || null;
  }

  // ─── Incrémenter la fréquence ─────────────────────────
  static async incrementFrequency(id) {
    await database.query(
      "SELECT increment_faq_frequency($1)", [id]
    );
  }

  // ─── Créer ────────────────────────────────────────────
  static async create({ category, question_fr, answer_fr, order_index = 0 }) {
    const result = await database.query(
      `INSERT INTO faqs (category, question_fr, answer_fr, order_index)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [category, question_fr, answer_fr, order_index]
    );
    return result.rows[0];
  }

  // ─── Créer depuis une question user (admin) ───────────
  static async createFromQuestion({ category, question_fr, answer_fr }) {
    const result = await database.query(
      `INSERT INTO faqs (category, question_fr, answer_fr, order_index, frequency)
       VALUES ($1, $2, $3, 0, 1)
       RETURNING id`,
      [category, question_fr, answer_fr]
    );
    return result.rows[0].id;
  }

  // ─── Mettre à jour ────────────────────────────────────
  static async update(id, { category, question_fr, answer_fr, order_index, is_active }) {
    const result = await database.query(
      `UPDATE faqs
       SET category    = $1,
           question_fr = $2,
           answer_fr   = $3,
           order_index = $4,
           is_active   = $5,
           updated_at  = NOW()
       WHERE id = $6
       RETURNING *`,
      [category, question_fr, answer_fr, order_index, is_active, id]
    );
    return result.rows[0];
  }

  // ─── Toggle is_active ─────────────────────────────────
  static async toggle(id, is_active) {
    const result = await database.query(
      "UPDATE faqs SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [is_active, id]
    );
    return result.rows[0];
  }

  // ─── Supprimer ────────────────────────────────────────
  static async delete(id) {
    await database.query("DELETE FROM faqs WHERE id = $1", [id]);
  }
}

export default Faq;