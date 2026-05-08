import database from "../database/db.js";

class Reclamation {
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

  static async findByUserId(userId) {
    const result = await database.query(
      `SELECT r.*, o.order_number
       FROM reclamations r
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async findAll({ status, page = 1, limit = 15 } = {}) {
    const offset = (page - 1) * limit;
    const values = [];
    let where    = "";

    if (status) {
      where = "WHERE r.status = $1";
      values.push(status);
    }

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

  static async create({ user_id, order_id, reclamation_type, message, deadline_at }) {
    const result = await database.query(
      `INSERT INTO reclamations (user_id, order_id, reclamation_type, message, deadline_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, order_id || null, reclamation_type, message, deadline_at || null]
    );
    return result.rows[0];
  }

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

  static async updateStatus(id, status) {
    const result = await database.query(
      "UPDATE reclamations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id]
    );
    return result.rows[0];
  }
}

export default Reclamation;