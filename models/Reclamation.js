import database from "../database/db.js";

class Reclamation {
  // ─── Trouver par ID (simple) ──────────────────────────
  static async findById(id) {
    const result = await database.query(
      `SELECT r.*,
         u.name  AS user_name,  u.email AS user_email,
         a.name  AS admin_name,
         o.order_number
       FROM reclamations r
       LEFT JOIN users  u ON u.id = r.user_id
       LEFT JOIN users  a ON a.id = r.admin_id
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par ID (complet pour admin) ─────────────
  static async findByIdFull(id) {
    const result = await database.query(
      `SELECT
         r.*,
         u.name   AS user_name,  u.email AS user_email, u.phone AS user_phone,
         a.name   AS admin_name,
         o.order_number,
         o.status       AS order_status,
         o.total_price  AS order_total,
         o.created_at   AS order_date
       FROM reclamations r
       LEFT JOIN users  u ON u.id = r.user_id
       LEFT JOIN users  a ON a.id = r.admin_id
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Réclamations d'un user ───────────────────────────
  static async findByUserId(userId) {
    const result = await database.query(
      `SELECT
         r.id, r.reclamation_type, r.message, r.status,
         r.admin_response, r.responded_at,
         r.created_at, r.updated_at,
         o.order_number
       FROM reclamations r
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  // ─── Réclamation active d'un type pour une commande ──
  static async findActiveByOrderAndType(orderId, userId, reclamationType) {
    const result = await database.query(
      `SELECT id FROM reclamations
       WHERE order_id         = $1
         AND user_id          = $2
         AND reclamation_type = $3
         AND status NOT IN ('resolue', 'rejetee')`,
      [orderId, userId, reclamationType]
    );
    return result.rows[0] || null;
  }

  // ─── Toutes les réclamations avec filtres (admin) ─────
  static async findAllAdmin({ status, type, page = 1, limit = 15 } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = [];
    const values     = [];
    let   i          = 1;

    if (status) { conditions.push(`r.status = $${i}`);           values.push(status); i++; }
    if (type)   { conditions.push(`r.reclamation_type = $${i}`); values.push(type);   i++; }

    const where       = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countValues = [...values];
    values.push(limit, offset);

    const [totalResult, result] = await Promise.all([
      database.query(`SELECT COUNT(*) FROM reclamations r ${where}`, countValues),
      database.query(
        `SELECT
           r.id, r.reclamation_type, r.message, r.status,
           r.admin_response, r.responded_at,
           r.resolution_delay, r.deadline_at,
           r.created_at, r.updated_at,
           u.id    AS user_id,
           u.name  AS user_name,  u.email AS user_email, u.phone AS user_phone,
           o.id           AS order_id,
           o.order_number,
           o.status       AS order_status,
           o.total_price  AS order_total,
           o.created_at   AS order_date,
           a.name         AS admin_name
         FROM reclamations r
         LEFT JOIN users  u ON u.id = r.user_id
         LEFT JOIN orders o ON o.id = r.order_id
         LEFT JOIN users  a ON a.id = r.admin_id
         ${where}
         ORDER BY
           CASE r.status
             WHEN 'urgente'    THEN 1
             WHEN 'en_retard'  THEN 2
             WHEN 'en_attente' THEN 3
             WHEN 'en_cours'   THEN 4
             ELSE 5
           END,
           r.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        values
      ),
    ]);

    return {
      total:        parseInt(totalResult.rows[0].count),
      totalPages:   Math.ceil(parseInt(totalResult.rows[0].count) / limit),
      page,
      reclamations: result.rows,
    };
  }

  // ─── Créer ────────────────────────────────────────────
  static async create({ user_id, order_id, reclamation_type, message, deadline_at }) {
    const result = await database.query(
      `INSERT INTO reclamations (user_id, order_id, reclamation_type, message, deadline_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, order_id || null, reclamation_type, message, deadline_at || null]
    );
    return result.rows[0];
  }

  // ─── Répondre (admin — complet) ───────────────────────
  static async respondFull(id, { admin_id, admin_response, status, resolution_delay, deadline_at }) {
    const result = await database.query(
      `UPDATE reclamations
       SET status           = $1,
           admin_response   = $2,
           admin_id         = $3,
           responded_at     = NOW(),
           resolution_delay = $4,
           deadline_at      = $5,
           updated_at       = NOW()
       WHERE id = $6
       RETURNING *`,
      [status, admin_response, admin_id, resolution_delay, deadline_at, id]
    );
    return result.rows[0];
  }

  // ─── Répondre (simple) ────────────────────────────────
  static async respond(id, { admin_id, admin_response, status }) {
    const result = await database.query(
      `UPDATE reclamations
       SET admin_id       = $1,
           admin_response = $2,
           status         = $3,
           responded_at   = NOW(),
           updated_at     = NOW()
       WHERE id = $4
       RETURNING *`,
      [admin_id, admin_response, status, id]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour le statut ──────────────────────────
  static async updateStatus(id, status) {
    const result = await database.query(
      "UPDATE reclamations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id]
    );
    return result.rows[0];
  }

  // ─── Stats dashboard ──────────────────────────────────
  static async getStats() {
    const result = await database.query(
      `SELECT
         COUNT(*)                                                     AS total,
         COUNT(*) FILTER (WHERE status = 'en_attente')               AS en_attente,
         COUNT(*) FILTER (WHERE status = 'en_cours')                 AS en_cours,
         COUNT(*) FILTER (WHERE status = 'urgente')                  AS urgentes,
         COUNT(*) FILTER (WHERE status = 'en_retard')                AS en_retard,
         COUNT(*) FILTER (WHERE status = 'resolue')                  AS resolues,
         COUNT(*) FILTER (WHERE status = 'rejetee')                  AS rejetees,
         ROUND(
           AVG(
             EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600
           ) FILTER (WHERE responded_at IS NOT NULL)
         )                                                            AS avg_response_hours
       FROM reclamations`
    );
    return result.rows[0];
  }

  // ─── findAll simple (existant) ────────────────────────
  static async findAll({ status, page = 1, limit = 15 } = {}) {
    const offset = (page - 1) * limit;
    const values = [];
    let where    = "";

    if (status) { where = "WHERE r.status = $1"; values.push(status); }

    values.push(limit, offset);
    const idx = values.length;

    const result = await database.query(
      `SELECT r.*,
         u.name AS user_name, u.email AS user_email,
         o.order_number
       FROM reclamations r
       LEFT JOIN users  u ON u.id = r.user_id
       LEFT JOIN orders o ON o.id = r.order_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx - 1} OFFSET $${idx}`,
      values
    );
    return result.rows;
  }
}

export default Reclamation;