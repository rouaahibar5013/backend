import database from "../database/db.js";

class RecipeStep {
  static async findByRecipeId(recipeId) {
    const result = await database.query(
      "SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY step_number ASC",
      [recipeId]
    );
    return result.rows;
  }

  static async create({ recipe_id, step_number, instruction_fr, image, duration }) {
    const result = await database.query(
      `INSERT INTO recipe_steps (recipe_id, step_number, instruction_fr, image, duration)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [recipe_id, step_number, instruction_fr, image || null, duration || null]
    );
    return result.rows[0];
  }

  static async deleteByRecipeId(recipeId) {
    await database.query("DELETE FROM recipe_steps WHERE recipe_id = $1", [recipeId]);
  }
}

export default RecipeStep;