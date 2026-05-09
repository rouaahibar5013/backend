import database from "../database/db.js";

class Wishlist {
  static async findByUserId(userId) {
    const result = await database.query(
      `SELECT w.*, p.name_fr, p.slug, p.images, p.rating_avg
       FROM wishlists w
       JOIN products p ON p.id = w.product_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async findOne(userId, productId) {
    const result = await database.query(
      "SELECT * FROM wishlists WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
    return result.rows[0] || null;
  }

  static async add(userId, productId) {
    const result = await database.query(
      `INSERT INTO wishlists (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING
       RETURNING *`,
      [userId, productId]
    );
    return result.rows[0] || null;
  }

  static async remove(userId, productId) {
    await database.query(
      "DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
  }
  static async clear(userId) {
  await database.query("DELETE FROM wishlists WHERE user_id = $1", [userId]);
}
}


export default Wishlist;