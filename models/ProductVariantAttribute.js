import database from "../database/db.js";

class ProductVariantAttribute {
  static async findByVariantId(variantId) {
    const result = await database.query(
      `SELECT pva.*, at.name_fr AS attribute_type_name
       FROM product_variant_attributes pva
       JOIN attribute_types at ON at.id = pva.attribute_type_id
       WHERE pva.variant_id = $1
       ORDER BY at.name_fr`,
      [variantId]
    );
    return result.rows;
  }

  static async create({ variant_id, attribute_type_id, value_fr }) {
    const result = await database.query(
      `INSERT INTO product_variant_attributes (variant_id, attribute_type_id, value_fr)
       VALUES ($1, $2, $3)
       ON CONFLICT (variant_id, attribute_type_id) DO UPDATE SET value_fr = $3
       RETURNING *`,
      [variant_id, attribute_type_id, value_fr]
    );
    return result.rows[0];
  }

  static async deleteByVariantId(variantId) {
    await database.query(
      "DELETE FROM product_variant_attributes WHERE variant_id = $1",
      [variantId]
    );
  }
}

export default ProductVariantAttribute;