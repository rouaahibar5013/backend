import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// HELPER — upload product images in parallel
// ═══════════════════════════════════════════════════════════
const uploadProductImages = async (imageFiles) => {
  const images   = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    images.map(image =>
      cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Product_Images",
        width:  1000,
        crop:   "scale",
      })
    )
  );
  return uploaded.map(r => ({ url: r.secure_url, public_id: r.public_id }));
};


// ═══════════════════════════════════════════════════════════
// HELPER — upsert attribute type + value
// ═══════════════════════════════════════════════════════════
const upsertAttribute = async (attribute_type, value) => {
  let typeResult = await database.query(
    "SELECT id FROM attribute_types WHERE name ILIKE $1", [attribute_type]
  );
  if (typeResult.rows.length === 0)
    typeResult = await database.query(
      "INSERT INTO attribute_types (name) VALUES ($1) RETURNING *", [attribute_type]
    );
  const typeId = typeResult.rows[0].id;

  let valueResult = await database.query(
    "SELECT id FROM attribute_values WHERE attribute_type_id=$1 AND value ILIKE $2",
    [typeId, value]
  );
  if (valueResult.rows.length === 0)
    valueResult = await database.query(
      "INSERT INTO attribute_values (attribute_type_id, value) VALUES ($1, $2) RETURNING *",
      [typeId, value]
    );

  return valueResult.rows[0].id;
};


// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const createProductService = async ({
  name, description, ethical_info, supplier_name,
  category_id, variants, userId, files,
}) => {
  // Check category
  const category = await database.query(
    "SELECT id FROM categories WHERE id=$1", [category_id]
  );
  if (category.rows.length === 0)
    throw new ErrorHandler("Category not found.", 404);

  // Resolve supplier
  let supplierId = null;
  if (supplier_name) {
    const supplier = await database.query(
      "SELECT id FROM suppliers WHERE name ILIKE $1", [supplier_name]
    );
    if (supplier.rows.length === 0)
      throw new ErrorHandler("Supplier not found. Create the supplier first.", 404);
    supplierId = supplier.rows[0].id;
  }

  // ✅ Upload product images (now on products table)
  let uploadedImages = [];
  if (files && files.images) {
    uploadedImages = await uploadProductImages(files.images);
  }

  // Insert product
  const productResult = await database.query(
    `INSERT INTO products
      (name, description, ethical_info, supplier_id, category_id, created_by, images)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, description, ethical_info || null, supplierId,
     category_id, userId, JSON.stringify(uploadedImages)]
  );

  const product         = productResult.rows[0];
  const createdVariants = [];

  // Create variants
  for (const variant of variants) {
    const { price, stock, attributes } = variant;

    if (!price || price < 0)
      throw new ErrorHandler("Each variant must have a valid price.", 400);

    const variantResult = await database.query(
      "INSERT INTO product_variants (product_id, price, stock) VALUES ($1, $2, $3) RETURNING *",
      [product.id, price, stock || 0]
    );
    const newVariant = variantResult.rows[0];

    // Add attributes
    if (attributes && attributes.length > 0) {
      for (const attr of attributes) {
        const { attribute_type, value } = attr;
        const valueId = await upsertAttribute(attribute_type, value);
        await database.query(
          "INSERT INTO variant_attributes (variant_id, attribute_value_id) VALUES ($1, $2)",
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
// ✅ Shows price from first variant
// ✅ Images from products table
// ═══════════════════════════════════════════════════════════
export const fetchAllProductsService = async ({
  search, category_id, ratings, min_price, max_price, page = 1
}) => {
  const limit  = 12;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (category_id) {
    conditions.push(`p.category_id = $${index}`);
    values.push(category_id); index++;
  }
  if (ratings) {
    conditions.push(`p.ratings >= $${index}`);
    values.push(ratings); index++;
  }
  if (search) {
    conditions.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`);
    values.push(`%${search}%`); index++;
  }
  if (min_price) {
    conditions.push(
      `(SELECT pv.price FROM product_variants pv WHERE pv.product_id = p.id ORDER BY pv.created_at ASC LIMIT 1) >= $${index}`
    );
    values.push(min_price); index++;
  }
  if (max_price) {
    conditions.push(
      `(SELECT pv.price FROM product_variants pv WHERE pv.product_id = p.id ORDER BY pv.created_at ASC LIMIT 1) <= $${index}`
    );
    values.push(max_price); index++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const countValues = [...values];
  values.push(limit, offset);

  // ✅ Run count + products in parallel
  const [totalResult, result] = await Promise.all([
    database.query(`SELECT COUNT(*) FROM products p ${whereClause}`, countValues),
    database.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.ethical_info,
         p.ratings,
         p.images,
         p.created_at,
         p.supplier_id,
         c.name   AS category_name,
         c.slug   AS category_slug,
         s.name   AS supplier_name,
         s.slug   AS supplier_slug,
         COUNT(DISTINCT r.id) AS review_count,
         -- ✅ Price from first variant
         (SELECT pv.price FROM product_variants pv
          WHERE pv.product_id = p.id
          ORDER BY pv.created_at ASC LIMIT 1) AS price,
         -- ✅ Total stock from all variants
         (SELECT SUM(pv.stock) FROM product_variants pv
          WHERE pv.product_id = p.id) AS total_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN reviews    r ON r.product_id = p.id
       ${whereClause}
       GROUP BY p.id, c.name, c.slug, s.name, s.slug
       ORDER BY p.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    ),
  ]);

  const totalProducts = parseInt(totalResult.rows[0].count);

  return {
    totalProducts,
    totalPages: Math.ceil(totalProducts / limit),
    page,
    products:   result.rows,
  };
};


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE PRODUCT
// ✅ Same price as list page (first variant)
// ✅ Images from products table
// ✅ Variants with attributes
// ✅ Supplier slug for link to producer page
// ═══════════════════════════════════════════════════════════
export const fetchSingleProductService = async (productId) => {
  // ✅ Run product + variants in parallel
  const [productResult, variantsResult] = await Promise.all([
    database.query(
      `SELECT
         p.*,
         c.name        AS category_name,
         c.slug        AS category_slug,
         pc.name       AS parent_category_name,
         pc.slug       AS parent_category_slug,
         s.name        AS supplier_name,
         s.slug        AS supplier_slug,
         s.description AS supplier_description,
         -- ✅ Same price logic as list page
         (SELECT pv.price FROM product_variants pv
          WHERE pv.product_id = p.id
          ORDER BY pv.created_at ASC LIMIT 1) AS price,
         -- ✅ Total stock
         (SELECT SUM(pv.stock) FROM product_variants pv
          WHERE pv.product_id = p.id) AS total_stock,
         COALESCE(
           json_agg(
             json_build_object(
               'review_id',  r.id,
               'rating',     r.rating,
               'comment',    r.comment,
               'created_at', r.created_at,
               'reviewer',   json_build_object(
                 'id',     u.id,
                 'name',   u.name,
                 'avatar', u.avatar
               )
             )
           ) FILTER (WHERE r.id IS NOT NULL), '[]'
         ) AS reviews
       FROM products p
       LEFT JOIN categories c  ON c.id  = p.category_id
       LEFT JOIN categories pc ON pc.id = c.parent_id
       LEFT JOIN suppliers  s  ON s.id  = p.supplier_id
       LEFT JOIN reviews    r  ON r.product_id = p.id
       LEFT JOIN users      u  ON u.id  = r.user_id
       WHERE p.id = $1
       GROUP BY p.id, c.name, c.slug, pc.name, pc.slug,
                s.name, s.slug, s.description`,
      [productId]
    ),
    database.query(
      `SELECT
         pv.*,
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name,
               'attribute_value', av.value
             )
           ) FILTER (WHERE at.id IS NOT NULL), '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN variant_attributes va ON va.variant_id        = pv.id
       LEFT JOIN attribute_values   av ON av.id                = va.attribute_value_id
       LEFT JOIN attribute_types    at ON at.id                = av.attribute_type_id
       WHERE pv.product_id = $1
       GROUP BY pv.id
       ORDER BY pv.created_at ASC`,
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
// UPDATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const updateProductService = async ({
  productId, name, description, ethical_info, supplier_name, category_id, files
}) => {
  const product = await database.query(
    "SELECT * FROM products WHERE id=$1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  if (category_id) {
    const category = await database.query(
      "SELECT id FROM categories WHERE id=$1", [category_id]
    );
    if (category.rows.length === 0)
      throw new ErrorHandler("Category not found.", 404);
  }

  let supplierId = product.rows[0].supplier_id;
  if (supplier_name) {
    const supplier = await database.query(
      "SELECT id FROM suppliers WHERE name ILIKE $1", [supplier_name]
    );
    if (supplier.rows.length === 0)
      throw new ErrorHandler("Supplier not found.", 404);
    supplierId = supplier.rows[0].id;
  }

  // Handle images update
  let images = product.rows[0].images || [];
  if (files && files.images) {
    // ✅ Delete old images in parallel
    await Promise.all(
      images
        .filter(img => img.public_id)
        .map(img => cloudinary.uploader.destroy(img.public_id))
    );
    images = await uploadProductImages(files.images);
  }

  const result = await database.query(
    `UPDATE products
     SET name=$1, description=$2, ethical_info=$3,
         supplier_id=$4, category_id=$5, images=$6
     WHERE id=$7 RETURNING *`,
    [
      name         || product.rows[0].name,
      description  || product.rows[0].description,
      ethical_info || null,
      supplierId,
      category_id  || product.rows[0].category_id,
      JSON.stringify(images),
      productId,
    ]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADD VARIANT
// ═══════════════════════════════════════════════════════════
export const addVariantService = async ({ productId, price, stock, attributes }) => {
  const product = await database.query(
    "SELECT id FROM products WHERE id=$1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  if (!price || price < 0)
    throw new ErrorHandler("Please provide a valid price.", 400);

  const variantResult = await database.query(
    "INSERT INTO product_variants (product_id, price, stock) VALUES ($1, $2, $3) RETURNING *",
    [productId, price, stock || 0]
  );
  const variant = variantResult.rows[0];

  const parsedAttributes = typeof attributes === "string"
    ? JSON.parse(attributes) : attributes;

  if (parsedAttributes && parsedAttributes.length > 0) {
    for (const attr of parsedAttributes) {
      const { attribute_type, value } = attr;
      const valueId = await upsertAttribute(attribute_type, value);
      await database.query(
        "INSERT INTO variant_attributes (variant_id, attribute_value_id) VALUES ($1, $2)",
        [variant.id, valueId]
      );
    }
  }

  return variant;
};


// ═══════════════════════════════════════════════════════════
// UPDATE VARIANT
// ═══════════════════════════════════════════════════════════
export const updateVariantService = async ({ variantId, price, stock }) => {
  const variant = await database.query(
    "SELECT * FROM product_variants WHERE id=$1", [variantId]
  );
  if (variant.rows.length === 0)
    throw new ErrorHandler("Variant not found.", 404);

  const result = await database.query(
    "UPDATE product_variants SET price=$1, stock=$2 WHERE id=$3 RETURNING *",
    [price ?? variant.rows[0].price, stock ?? variant.rows[0].stock, variantId]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// DELETE VARIANT
// ═══════════════════════════════════════════════════════════
export const deleteVariantService = async (variantId) => {
  const variant = await database.query(
    "SELECT * FROM product_variants WHERE id=$1", [variantId]
  );
  if (variant.rows.length === 0)
    throw new ErrorHandler("Variant not found.", 404);

  await database.query("DELETE FROM product_variants WHERE id=$1", [variantId]);
};


// ═══════════════════════════════════════════════════════════
// DELETE PRODUCT
// ═══════════════════════════════════════════════════════════
export const deleteProductService = async (productId) => {
  const product = await database.query(
    "SELECT * FROM products WHERE id=$1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Product not found.", 404);

  // ✅ Delete product images in parallel
  await Promise.all(
    (product.rows[0].images || [])
      .filter(img => img.public_id)
      .map(img => cloudinary.uploader.destroy(img.public_id))
  );

  await database.query("DELETE FROM products WHERE id=$1", [productId]);
};


