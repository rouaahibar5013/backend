import database from "../database/db.js";

class EmailCampaign {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM email_campaign WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Toutes les campagnes ─────────────────────────────
  static async findAll() {
    const result = await database.query(
      "SELECT * FROM email_campaign ORDER BY created_at DESC"
    );
    return result.rows;
  }

  // ─── Créer une campagne ───────────────────────────────
  static async create({ title, subject, type, content_fr, status = 'draft', scheduled_at = null }) {
    const result = await database.query(
      `INSERT INTO email_campaign
         (title, subject, type, content_fr, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, subject, type, content_fr, status, scheduled_at]
    );
    return result.rows[0];
  }

  // ─── Marquer comme envoyée ────────────────────────────
  static async markSent(id, sentCount) {
    await database.query(
      `UPDATE email_campaign
       SET status = 'sent', sent_at = NOW(), sent_count = $1
       WHERE id = $2`,
      [sentCount, id]
    );
  }
}

export default EmailCampaign;