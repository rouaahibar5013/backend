import database from "../database/db.js";

class Review {
  static async findByProductId(productId, { page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    const result = await database.query(
      `SELECT r.*, u.name AS user_name, u.avatar AS user_avatar
       FROM review r
       LEFT JOIN "user" u ON u.id = r.user_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    );
    return result.rows;
  }

  // ─── Reviews + stats pour un produit (public) ────────
  static async findByProductIdWithStats(productId) {
    const [reviewsResult, statsResult] = await Promise.all([
      database.query(
        `SELECT
           r.id, r.user_id, r.rating, r.comment, r.created_at,
           COALESCE(u.name,   'Anonyme') AS user_name,
           COALESCE(u.avatar, null)      AS user_avatar
         FROM review r
         LEFT JOIN "user" u ON u.id = r.user_id
         WHERE r.product_id = $1
         ORDER BY r.created_at DESC`,
        [productId]
      ),
      database.query(
        `SELECT
           ROUND(AVG(rating)::numeric, 1)     AS average_rating,
           COUNT(*)                            AS total_reviews,
           COUNT(*) FILTER (WHERE rating = 5) AS five_stars,
           COUNT(*) FILTER (WHERE rating = 4) AS four_stars,
           COUNT(*) FILTER (WHERE rating = 3) AS three_stars,
           COUNT(*) FILTER (WHERE rating = 2) AS two_stars,
           COUNT(*) FILTER (WHERE rating = 1) AS one_star
         FROM review
         WHERE product_id = $1`,
        [productId]
      ),
    ]);

    return {
      stats: {
        average_rating: parseFloat(statsResult.rows[0].average_rating) || 0,
        total_reviews:  parseInt(statsResult.rows[0].total_reviews),
        distribution: {
          5: parseInt(statsResult.rows[0].five_stars),
          4: parseInt(statsResult.rows[0].four_stars),
          3: parseInt(statsResult.rows[0].three_stars),
          2: parseInt(statsResult.rows[0].two_stars),
          1: parseInt(statsResult.rows[0].one_star),
        },
      },
      reviews: reviewsResult.rows,
    };
  }

  static async findByUserId(userId) {
    const result = await database.query(
      `SELECT r.*, p.name_fr AS product_name, p.slug AS product_slug
       FROM review r
       LEFT JOIN product p ON p.id = r.product_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async findByUserAndProduct(userId, productId) {
    const result = await database.query(
      "SELECT * FROM review WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par ID + user (pour update/delete user) ─
  static async findByIdAndUser(reviewId, userId) {
    const result = await database.query(
      "SELECT * FROM review WHERE id = $1 AND user_id = $2",
      [reviewId, userId]
    );
    return result.rows[0] || null;
  }

  // ─── Vérifier achat (commande livrée) ────────────────
  static async verifyPurchase({ userId, productId }) {
    const result = await database.query(
      `SELECT 1
       FROM "order" o
       JOIN order_item      oi ON oi.order_id  = o.id
       JOIN product_variant pv ON pv.id        = oi.variant_id
       WHERE o.user_id     = $1
         AND pv.product_id = $2
         AND o.status      = 'livree'
       LIMIT 1`,
      [userId, productId]
    );
    return result.rows.length > 0;
  }

  static async create({ product_id, user_id, rating, comment }) {
    const result = await database.query(
      `INSERT INTO review (product_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [product_id, user_id, rating, comment]
    );
    return result.rows[0];
  }

  static async update(id, { rating, comment }) {
    const result = await database.query(
      `UPDATE review
       SET rating     = COALESCE($1, rating),
           comment    = COALESCE($2, comment),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [rating, comment, id]
    );
    return result.rows[0];
  }

  // ─── Supprimer avec confirmation (admin) ─────────────
  static async deleteById(id) {
    const result = await database.query(
      "DELETE FROM review WHERE id = $1 RETURNING id", [id]
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    await database.query("DELETE FROM review WHERE id = $1", [id]);
  }

  // ─── Tous les avis avec filtres (admin) ───────────────
  static async findAllAdmin({ rating, date_from, date_to, page = 1 }) {
    const LIMIT      = 20;
    const offset     = (page - 1) * LIMIT;
    const conditions = [];
    const values     = [];
    let   i          = 1;

    if (rating !== undefined) {
      conditions.push(`r.rating = $${i}`); values.push(parseInt(rating)); i++;
    }
    if (date_from) {
      conditions.push(`r.created_at >= $${i}`); values.push(new Date(date_from)); i++;
    }
    if (date_to) {
      conditions.push(`r.created_at <= $${i}`); values.push(new Date(date_to)); i++;
    }

    const WHERE       = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countValues = [...values];
    values.push(LIMIT, offset);

    const [totalResult, result] = await Promise.all([
      database.query(`SELECT COUNT(*) FROM review r ${WHERE}`, countValues),
      database.query(
        `SELECT
           r.id, r.rating, r.comment, r.created_at,
           COALESCE(u.name,  'Anonyme') AS user_name,
           COALESCE(u.email, 'Inconnu') AS user_email,
           p.name_fr AS product_name,
           p.id      AS product_id
         FROM review r
         LEFT JOIN "user"    u ON u.id = r.user_id
         LEFT JOIN product p ON p.id = r.product_id
         ${WHERE}
         ORDER BY r.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        values
      ),
    ]);

    return {
      total:      parseInt(totalResult.rows[0].count),
      totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / LIMIT),
      page,
      reviews:    result.rows,
    };
  }
}

export default Review;