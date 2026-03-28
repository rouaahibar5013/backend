import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// HELPER — upload product images in parallel
// ═══════════════════════════════════════════════════════════
const uploadProductImages = async (imageFiles) => {
  const images   = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    images.map(img =>
      cloudinary.uploader.upload(img.tempFilePath, {
        folder: "Ecommerce_Product_Images",
        width:  1000,
        crop:   "scale",
      })
    )
  );
  return uploaded.map(r => ({ url: r.secure_url, public_id: r.public_id }));
};

// ═══════════════════════════════════════════════════════════
// HELPER — upsert attribute type + value (bi-langue)
// Uses name_fr / value_fr columns (DB schema)
// ═══════════════════════════════════════════════════════════
const upsertAttribute = async (attribute_type_fr, value_fr, attribute_type_ar = null, value_ar = null) => {
  // Find or create attribute type
  let typeResult = await database.query(
    "SELECT id FROM attribute_types WHERE name_fr ILIKE $1",
    [attribute_type_fr]
  );
  if (typeResult.rows.length === 0) {
    typeResult = await database.query(
      "INSERT INTO attribute_types (name_fr, name_ar) VALUES ($1, $2) RETURNING id",
      [attribute_type_fr, attribute_type_ar || null]
    );
  }
  const typeId = typeResult.rows[0].id;

  // Find or create attribute value
  let valueResult = await database.query(
    "SELECT id FROM attribute_values WHERE attribute_type_id = $1 AND value_fr ILIKE $2",
    [typeId, value_fr]
  );
  if (valueResult.rows.length === 0) {
    valueResult = await database.query(
      "INSERT INTO attribute_values (attribute_type_id, value_fr, value_ar) VALUES ($1, $2, $3) RETURNING id",
      [typeId, value_fr, value_ar || null]
    );
  }

  return valueResult.rows[0].id;
};

// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const createProductService = async ({
  name_fr, name_ar, description_fr, description_ar,
  ethical_info_fr, ethical_info_ar, origin,
  usage_fr, usage_ar, ingredients_fr, ingredients_ar,
  precautions_fr, precautions_ar,
  certifications, supplier_id, category_id,
  slug, variants, userId, files,
}) => {
  // Validate category
  const category = await database.query(
    "SELECT id FROM categories WHERE id = $1", [category_id]
  );
  if (category.rows.length === 0)
    throw new ErrorHandler("Category not found.", 404);

  // Validate supplier if provided
  if (supplier_id) {
    const supplier = await database.query(
      "SELECT id FROM suppliers WHERE id = $1", [supplier_id]
    );
    if (supplier.rows.length === 0)
      throw new ErrorHandler("Supplier not found.", 404);
  }

  // Generate slug if not provided
  const finalSlug = slug || name_fr
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + Date.now();

  // Upload images
  let uploadedImages = [];
  if (files && files.images) {
    uploadedImages = await uploadProductImages(files.images);
  }

  // Insert product
  const productResult = await database.query(
    `INSERT INTO products
      (name_fr, name_ar, description_fr, description_ar,
       ethical_info_fr, ethical_info_ar, origin, certifications,
       usage_fr, usage_ar, ingredients_fr, ingredients_ar,
       precautions_fr, precautions_ar,
       supplier_id, category_id, created_by, images, slug)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      name_fr, name_ar || null,
      description_fr, description_ar || null,
      ethical_info_fr || null, ethical_info_ar || null,
      origin || null,
      certifications ? JSON.stringify(certifications) : null,
      usage_fr || null, usage_ar || null,
      ingredients_fr || null, ingredients_ar || null,
      precautions_fr || null, precautions_ar || null,
      supplier_id || null, category_id,
      userId, JSON.stringify(uploadedImages),
      finalSlug,
    ]
  );

  const product         = productResult.rows[0];
  const createdVariants = [];

  // Create variants + their attributes
  for (const variant of variants) {
    const {
      price, compare_price, cost_price,
      stock, sku, weight_grams, barcode,
      attributes,
    } = variant;

    if (!price || price < 0)
      throw new ErrorHandler("Each variant must have a valid price.", 400);

    const variantResult = await database.query(
      `INSERT INTO product_variants
        (product_id, sku, price, compare_price, cost_price,
         stock, weight_grams, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        product.id, sku || null,
        price, compare_price || null, cost_price || null,
        stock || 0, weight_grams || null, barcode || null,
      ]
    );
    const newVariant = variantResult.rows[0];

    // Link attributes via product_variant_attributes
    if (attributes && attributes.length > 0) {
      for (const attr of attributes) {
        const { type_fr, value_fr, type_ar, value_ar } = attr;
        const valueId = await upsertAttribute(type_fr, value_fr, type_ar, value_ar);
        await database.query(
          "INSERT INTO product_variant_attributes (variant_id, attribute_value_id) VALUES ($1, $2)",
          [newVariant.id, valueId]
        );
      }
    }

    createdVariants.push(newVariant);
  }

  return { product, variants: createdVariants };
};

// ═══════════════════════════════════════════════════════════
// FETCH ALL PRODUCTS
// ✅ Uses name_fr, rating_avg, product_variant_attributes
// ✅ Returns min_price from cheapest variant
// ═══════════════════════════════════════════════════════════
export const fetchAllProductsService = async ({
  search, category_id, min_rating, min_price, max_price, page = 1,
  is_featured, supplier_id,
}) => {
  const LIMIT  = 12;
  const offset = (page - 1) * LIMIT;

  const conditions = ["p.is_active = true"];
  const values     = [];
  let   i          = 1;

  if (category_id) {
    // Include subcategories
    conditions.push(`(p.category_id = $${i} OR c.parent_id = $${i})`);
    values.push(category_id); i++;
  }
  if (min_rating) {
    conditions.push(`p.rating_avg >= $${i}`);
    values.push(min_rating); i++;
  }
  if (is_featured) {
    conditions.push(`p.is_featured = true`);
  }
  if (supplier_id) {
    conditions.push(`p.supplier_id = $${i}`);
    values.push(supplier_id); i++;
  }
  if (search) {
    conditions.push(
      `(p.name_fr ILIKE $${i} OR p.name_ar ILIKE $${i} OR p.description_fr ILIKE $${i})`
    );
    values.push(`%${search}%`); i++;
  }
  if (min_price) {
    conditions.push(
      `(SELECT MIN(pv2.price) FROM product_variants pv2 WHERE pv2.product_id = p.id AND pv2.is_active = true) >= $${i}`
    );
    values.push(min_price); i++;
  }
  if (max_price) {
    conditions.push(
      `(SELECT MIN(pv2.price) FROM product_variants pv2 WHERE pv2.product_id = p.id AND pv2.is_active = true) <= $${i}`
    );
    values.push(max_price); i++;
  }

  const WHERE = `WHERE ${conditions.join(" AND ")}`;

  const countValues = [...values];
  values.push(LIMIT, offset);

  const [totalResult, result] = await Promise.all([
    database.query(
      `SELECT COUNT(DISTINCT p.id)
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${WHERE}`,
      countValues
    ),
    database.query(
      `SELECT
         p.id,
         p.name_fr,
         p.name_ar,
         p.slug,
         p.images,
         p.rating_avg,
         p.rating_count,
         p.is_featured,
         p.created_at,
         c.id        AS category_id,
         c.name_fr   AS category_name,
         c.slug      AS category_slug,
         s.id        AS supplier_id,
         s.name      AS supplier_name,
         s.slug      AS supplier_slug,
         s.is_certified_bio,
         -- min price from active variants
         (SELECT MIN(pv2.price)
          FROM product_variants pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true
         ) AS min_price,
         -- total stock
         (SELECT COALESCE(SUM(pv2.stock), 0)
          FROM product_variants pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true
         ) AS total_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       ${WHERE}
       GROUP BY p.id, c.id, c.name_fr, c.slug, s.id, s.name, s.slug, s.is_certified_bio
       ORDER BY p.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      values
    ),
  ]);

  const total = parseInt(totalResult.rows[0].count);

  return {
    totalProducts: total,
    totalPages:    Math.ceil(total / LIMIT),
    page,
    products:      result.rows,
  };
};

// ═══════════════════════════════════════════════════════════
// FETCH SINGLE PRODUCT
// ✅ Full details + variants + attributes + reviews
// ═══════════════════════════════════════════════════════════
export const fetchSingleProductService = async (productId) => {
  const [productResult, variantsResult] = await Promise.all([
    database.query(
      `SELECT
         p.*,
         c.id          AS category_id,
         c.name_fr     AS category_name,
         c.name_ar     AS category_name_ar,
         c.slug        AS category_slug,
         pc.name_fr    AS parent_category_name,
         pc.slug       AS parent_category_slug,
         s.name        AS supplier_name,
         s.name_ar     AS supplier_name_ar,
         s.slug        AS supplier_slug,
         s.description_fr  AS supplier_description,
         s.region      AS supplier_region,
         s.is_certified_bio,
         COALESCE(
           json_agg(
             json_build_object(
               'review_id',   r.id,
               'rating',      r.rating,
               'title',       r.title,
               'comment',     r.comment,
               'is_verified', r.is_verified_purchase,
               'helpful',     r.helpful_count,
               'created_at',  r.created_at,
               'reviewer', json_build_object(
                 'id',     u.id,
                 'name',   u.name,
                 'avatar', u.avatar
               )
             )
           ) FILTER (WHERE r.id IS NOT NULL AND r.is_approved = true),
           '[]'
         ) AS reviews
       FROM products p
       LEFT JOIN categories c  ON c.id  = p.category_id
       LEFT JOIN categories pc ON pc.id = c.parent_id
       LEFT JOIN suppliers  s  ON s.id  = p.supplier_id
       LEFT JOIN reviews    r  ON r.product_id = p.id
       LEFT JOIN users      u  ON u.id  = r.user_id
       WHERE p.id = $1 AND p.is_active = true
       GROUP BY p.id, c.id, c.name_fr, c.name_ar, c.slug,
                pc.name_fr, pc.slug,
                s.name, s.name_ar, s.slug, s.description_fr,
                s.region, s.is_certified_bio`,
      [productId]
    ),
    database.query(
      `SELECT
         pv.*,
         COALESCE(
           json_agg(
             json_build_object(
               'type_fr',    at.name_fr,
               'type_ar',    at.name_ar,
               'unit',       at.unit,
               'value_fr',   av.value_fr,
               'value_ar',   av.value_ar,
               'sort_order', av.sort_order
             )
             ORDER BY av.sort_order
           ) FILTER (WHERE at.id IS NOT NULL),
           '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN product_variant_attributes pva ON pva.variant_id        = pv.id
       LEFT JOIN attribute_values           av  ON av.id                 = pva.attribute_value_id
       LEFT JOIN attribute_types            at  ON at.id                 = av.attribute_type_id
       WHERE pv.product_id = $1 AND pv.is_active = true
       GROUP BY pv.id
       ORDER BY pv.price ASC`,
      [productId]
    ),
  ]);

  if (productResult.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  const product    = productResult.rows[0];
  product.variants = variantsResult.rows;

  return product;
};

// ═══════════════════════════════════════════════════════════
// FETCH FEATURED PRODUCTS (homepage)
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedProductsService = async (limit = 8) => {
  const result = await database.query(
    `SELECT
       p.id, p.name_fr, p.name_ar, p.slug, p.images,
       p.rating_avg, p.rating_count, p.is_featured,
       c.name_fr  AS category_name,
       c.slug     AS category_slug,
       s.name     AS supplier_name,
       s.slug     AS supplier_slug,
       s.is_certified_bio,
       (SELECT MIN(pv2.price)
        FROM product_variants pv2
        WHERE pv2.product_id = p.id AND pv2.is_active = true
       ) AS min_price,
       (SELECT COALESCE(SUM(pv2.stock), 0)
        FROM product_variants pv2
        WHERE pv2.product_id = p.id AND pv2.is_active = true
       ) AS total_stock
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers  s ON s.id = p.supplier_id
     WHERE p.is_active = true AND p.is_featured = true
     ORDER BY p.rating_avg DESC, p.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// UPDATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const updateProductService = async ({
  productId, name_fr, name_ar, description_fr, description_ar,
  ethical_info_fr, ethical_info_ar, origin, certifications,
  usage_fr, usage_ar, ingredients_fr, ingredients_ar,
  precautions_fr, precautions_ar,
  supplier_id, category_id, slug, is_active, is_featured, files,
}) => {
  const existing = await database.query(
    "SELECT * FROM products WHERE id = $1", [productId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  const p = existing.rows[0];

  if (category_id) {
    const cat = await database.query("SELECT id FROM categories WHERE id=$1", [category_id]);
    if (cat.rows.length === 0) throw new ErrorHandler("Category not found.", 404);
  }
  if (supplier_id) {
    const sup = await database.query("SELECT id FROM suppliers WHERE id=$1", [supplier_id]);
    if (sup.rows.length === 0) throw new ErrorHandler("Supplier not found.", 404);
  }

  let images = p.images || [];
  if (files && files.images) {
    await Promise.all(
      images.filter(img => img.public_id)
            .map(img => cloudinary.uploader.destroy(img.public_id))
    );
    images = await uploadProductImages(files.images);
  }

  const result = await database.query(
    `UPDATE products SET
       name_fr=$1, name_ar=$2,
       description_fr=$3, description_ar=$4,
       ethical_info_fr=$5, ethical_info_ar=$6,
       origin=$7, certifications=$8,
       usage_fr=$9, usage_ar=$10,
       ingredients_fr=$11, ingredients_ar=$12,
       precautions_fr=$13, precautions_ar=$14,
       supplier_id=$15, category_id=$16,
       slug=$17, is_active=$18, is_featured=$19, images=$20,
       updated_at=now()
     WHERE id=$21 RETURNING *`,
    [
      name_fr          ?? p.name_fr,
      name_ar          ?? p.name_ar,
      description_fr   ?? p.description_fr,
      description_ar   ?? p.description_ar,
      ethical_info_fr  ?? p.ethical_info_fr,
      ethical_info_ar  ?? p.ethical_info_ar,
      origin           ?? p.origin,
      certifications   ? JSON.stringify(certifications) : p.certifications,
      usage_fr         ?? p.usage_fr,
      usage_ar         ?? p.usage_ar,
      ingredients_fr   ?? p.ingredients_fr,
      ingredients_ar   ?? p.ingredients_ar,
      precautions_fr   ?? p.precautions_fr,
      precautions_ar   ?? p.precautions_ar,
      supplier_id      ?? p.supplier_id,
      category_id      ?? p.category_id,
      slug             ?? p.slug,
      is_active        ?? p.is_active,
      is_featured      ?? p.is_featured,
      JSON.stringify(images),
      productId,
    ]
  );

  return result.rows[0];

};

// ═══════════════════════════════════════════════════════════
// ADD VARIANT
// ═══════════════════════════════════════════════════════════
export const addVariantService = async ({
  productId, price, compare_price, cost_price,
  stock, sku, weight_grams, barcode, attributes,
}) => {
  const product = await database.query(
    "SELECT id FROM products WHERE id = $1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  if (!price || price < 0)
    throw new ErrorHandler("Please provide a valid price.", 400);

  const variantResult = await database.query(
    `INSERT INTO product_variants
      (product_id, sku, price, compare_price, cost_price, stock, weight_grams, barcode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [productId, sku || null, price, compare_price || null, cost_price || null,
     stock || 0, weight_grams || null, barcode || null]
  );
  const variant = variantResult.rows[0];

  const parsedAttrs = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
  if (parsedAttrs && parsedAttrs.length > 0) {
    for (const attr of parsedAttrs) {
      const valueId = await upsertAttribute(attr.type_fr, attr.value_fr, attr.type_ar, attr.value_ar);
      await database.query(
        "INSERT INTO product_variant_attributes (variant_id, attribute_value_id) VALUES ($1,$2)",
        [variant.id, valueId]
      );
    }
  }

  return variant;
};

// ═══════════════════════════════════════════════════════════
// UPDATE VARIANT
// ═══════════════════════════════════════════════════════════
export const updateVariantService = async ({
  variantId, price, compare_price, cost_price,
  stock, sku, weight_grams, is_active,
}) => {
  const existing = await database.query(
    "SELECT * FROM product_variants WHERE id = $1", [variantId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Variant not found.", 404);

  const v = existing.rows[0];

  const result = await database.query(
    `UPDATE product_variants SET
       price=$1, compare_price=$2, cost_price=$3,
       stock=$4, sku=$5, weight_grams=$6, is_active=$7,
       updated_at=now()
     WHERE id=$8 RETURNING *`,
    [
      price         ?? v.price,
      compare_price ?? v.compare_price,
      cost_price    ?? v.cost_price,
      stock         ?? v.stock,
      sku           ?? v.sku,
      weight_grams  ?? v.weight_grams,
      is_active     ?? v.is_active,
      variantId,
    ]
  );

  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// DELETE VARIANT
// ═══════════════════════════════════════════════════════════
export const deleteVariantService = async (variantId) => {
  const variant = await database.query(
    "SELECT * FROM product_variants WHERE id = $1", [variantId]
  );
  if (variant.rows.length === 0)
    throw new ErrorHandler("Variant not found.", 404);

  // Delete attributes first (FK constraint)
  await database.query(
    "DELETE FROM product_variant_attributes WHERE variant_id = $1", [variantId]
  );
  await database.query(
    "DELETE FROM product_variants WHERE id = $1", [variantId]
  );
};

// ═══════════════════════════════════════════════════════════
// DELETE PRODUCT
// ═══════════════════════════════════════════════════════════
export const deleteProductService = async (productId) => {
  const product = await database.query(
    "SELECT * FROM products WHERE id = $1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  // Delete images from Cloudinary
  await Promise.all(
    (product.rows[0].images || [])
      .filter(img => img.public_id)
      .map(img => cloudinary.uploader.destroy(img.public_id))
  );

  // Cascade deletes variants + attributes automatically (FK CASCADE)
  await database.query("DELETE FROM products WHERE id = $1", [productId]);
};
