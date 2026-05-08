import database from "../database/db.js";

class RecipeIngredient {
  static async findByRecipeId(recipeId) {
    const result = await database.query(
      `SELECT ri.*, p.name_fr AS product_name, p.slug AS product_slug
       FROM recipe_ingredients ri
       LEFT JOIN products p ON p.id = ri.product_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order ASC`,
      [recipeId]
    );
    return result.rows;
  }

  static async create({ recipe_id, product_id, name_fr, quantity, is_bio, sort_order }) {
    const result = await database.query(
      `INSERT INTO recipe_ingredients (recipe_id, product_id, name_fr, quantity, is_bio, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [recipe_id, product_id || null, name_fr, quantity || null, is_bio ?? true, sort_order || 0]
    );
    return result.rows[0];
  }

  static async deleteByRecipeId(recipeId) {
    await database.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]);
  }
}

export default RecipeIngredient;