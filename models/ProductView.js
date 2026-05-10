import database from "../database/db.js";

class ProductView {
  static async create(productId) {
    await database.query(
      "INSERT INTO product_view (product_id) VALUES ($1)",
      [productId]
    );
  }

  static async countByProductId(productId) {
    const result = await database.query(
      "SELECT COUNT(*) FROM product_view WHERE product_id = $1",
      [productId]
    );
    return parseInt(result.rows[0].count);
  }

  static async getTopViewed({ limit = 10, days = 30 } = {}) {
    const result = await database.query(
      `SELECT product_id, COUNT(*) AS view_count
       FROM product_view
       WHERE viewed_at >= NOW() - INTERVAL '${days} days'
       GROUP BY product_id
       ORDER BY view_count DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

export default ProductView;