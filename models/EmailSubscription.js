import database from "../database/db.js";

class EmailSubscription {
  // ─── Trouver par email ────────────────────────────────
  static async findByEmail(email) {
    const result = await database.query(
      "SELECT * FROM email_subscription WHERE email = $1", [email]
    );
    return result.rows[0] || null;
  }

  // ─── Tous les abonnés actifs ──────────────────────────
  static async findAllActive() {
    const result = await database.query(
      "SELECT email, name FROM email_subscription WHERE is_active = true"
    );
    return result.rows;
  }

  // ─── Tous les abonnés avec infos user (admin) ─────────
  static async findAllWithUser() {
    const result = await database.query(
      `SELECT es.*, u.name AS user_name
       FROM email_subscription es
       LEFT JOIN "user" u ON u.id = es.user_id
       ORDER BY es.subscribed_at DESC`
    );
    return result.rows;
  }

  // ─── Créer un abonnement ──────────────────────────────
  static async create({ userId, email, name }) {
    const result = await database.query(
      `INSERT INTO email_subscription (user_id, email, name)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId || null, email, name || null]
    );
    return result.rows[0];
  }

  // ─── Réactiver un abonnement ──────────────────────────
  static async reactivate(email, name) {
    const result = await database.query(
      `UPDATE email_subscription
       SET is_active = true, unsubscribed_at = NULL, name = $1
       WHERE email = $2 RETURNING *`,
      [name, email]
    );
    return result.rows[0];
  }

  // ─── Désactiver un abonnement ─────────────────────────
  static async deactivate(email) {
    const result = await database.query(
      `UPDATE email_subscription
       SET is_active = false, unsubscribed_at = NOW()
       WHERE email = $1 RETURNING *`,
      [email]
    );
    return result.rows[0] || null;
  }

  // ─── Lier à un user (après register/login) ────────────
  static async linkToUser(userId, email) {
    await database.query(
      `UPDATE email_subscription
       SET user_id = $1
       WHERE email = $2 AND user_id IS NULL`,
      [userId, email]
    );
  }
}

export default EmailSubscription;