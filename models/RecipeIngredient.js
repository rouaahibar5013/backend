import database from "../database/db.js";

class RecipeIngredient {
  static async findByRecipeId(recipeId) {
    const result = await database.query(
      `SELECT ri.*, p.name_fr AS product_name, p.slug AS product_slug
       FROM recipe_ingredient ri
       LEFT JOIN product p ON p.id = ri.product_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order ASC`,
      [recipeId]
    );
    return result.rows;
  }

  // ─── Avec prix produit (page publique) ───────────────
  static async findByRecipeIdWithProduct(recipeId) {
    const result = await database.query(
      `SELECT
         ri.*,
         p.slug   AS product_slug,
         p.images AS product_images,
         (SELECT pv.price FROM product_variant pv
          WHERE pv.product_id = p.id AND pv.is_active = true
          ORDER BY pv.created_at ASC LIMIT 1) AS product_price
       FROM recipe_ingredient ri
       LEFT JOIN product p ON p.id = ri.product_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order ASC`,
      [recipeId]
    );
    return result.rows;
  }

  static async create({ recipe_id, product_id, name_fr, quantity, is_bio, sort_order }) {
    const result = await database.query(
      `INSERT INTO recipe_ingredient (recipe_id, product_id, name_fr, quantity, is_bio, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [recipe_id, product_id || null, name_fr, quantity || null, is_bio ?? true, sort_order || 0]
    );
    return result.rows[0];
  }

  static async deleteByRecipeId(recipeId) {
    await database.query("DELETE FROM recipe_ingredient WHERE recipe_id = $1", [recipeId]);
  }
}

export default RecipeIngredient;