import database from "../database/db.js";

class AttributeType {
  static async findAll() {
    const result = await database.query(
      "SELECT * FROM attribute_type ORDER BY name_fr ASC"
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM attribute_type WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Upsert (INSERT ON CONFLICT) ──────────────────────
  static async upsert(name_fr, unit) {
    const result = await database.query(
      `INSERT INTO attribute_types (name_fr, unit)
       VALUES ($1, $2)
       ON CONFLICT (name_fr) DO UPDATE
         SET unit = CASE
           WHEN $2::text IS NOT NULL THEN EXCLUDED.unit
           ELSE attribute_types.unit
         END
       RETURNING id`,
      [name_fr.trim(), unit?.trim() || null]
    );
    return result.rows[0].id;
  }

  static async create({ name_fr, unit }) {
    const result = await database.query(
      "INSERT INTO attribute_types (name_fr, unit) VALUES ($1, $2) RETURNING *",
      [name_fr, unit || null]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await database.query("DELETE FROM attribute_type WHERE id = $1", [id]);
  }
}

export default AttributeType;