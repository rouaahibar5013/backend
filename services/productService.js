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
// ═══════════════════════════════════════════════════════════
// HELPER — upsert attribute type + value (Version sans arabe)
// ═══════════════════════════════════════════════════════════
const upsertAttribute = async (attribute_type_fr, value_fr) => {
  // Find or create attribute type
  let typeResult = await database.query(
    "SELECT id FROM attribute_types WHERE name_fr ILIKE $1",
    [attribute_type_fr]
  );

  if (typeResult.rows.length === 0) {
    typeResult = await database.query(
      "INSERT INTO attribute_types (name_fr) VALUES ($1) RETURNING id",
      [attribute_type_fr]
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
      "INSERT INTO attribute_values (attribute_type_id, value_fr) VALUES ($1, $2) RETURNING id",
      [typeId, value_fr]
    );
  }

  return valueResult.rows[0].id;
};

// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const createProductService = async ({
  name_fr, description_fr, 
  ethical_info_fr,  origin,
  usage_fr,  ingredients_fr, 
  precautions_fr, 
  certifications, supplier_id, category_id,
  slug, variants, userId, files,
  is_active, is_featured, is_new, 
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
      (name_fr, description_fr, ethical_info_fr, origin, certifications,
      usage_fr, ingredients_fr, precautions_fr,
      supplier_id, category_id, created_by, images, slug,
      is_active, is_featured, is_new)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
   RETURNING *`,
  [
    name_fr,
    description_fr,
    ethical_info_fr || null,
    origin || null,
    certifications ? JSON.stringify(certifications) : null,
    usage_fr || null,
    ingredients_fr || null,
    precautions_fr || null,
    supplier_id || null,
    category_id,
    userId,
    JSON.stringify(uploadedImages),
    finalSlug,
    is_active  ?? true,                 
    is_featured ?? false,                
    is_new      ?? true,  
  ]
);

  const product         = productResult.rows[0];
  const createdVariants = [];

  // Create variants + their attributes// ✅ APRÈS
for (const variant of variants) {
  const {
    price, cost_price,
    stock, sku, weight_grams, barcode,
    low_stock_threshold,   // ← ajouté
    attributes,
  } = variant;

  const variantResult = await database.query(
    `INSERT INTO product_variants
      (product_id, sku, price, cost_price,
       stock, low_stock_threshold, weight_grams, barcode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      product.id, sku || null,
      price, cost_price || null,
      stock || 0, low_stock_threshold || 5,  // ← 5 = valeur par défaut
      weight_grams || null, barcode || null,
    ]
  );
    const newVariant = variantResult.rows[0];

    // Link attributes via product_variant_attributes
    if (attributes && attributes.length > 0) {
      for (const attr of attributes) {
        const { type_fr, value_fr} = attr;
        const valueId = await upsertAttribute(type_fr, value_fr);
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
// ═══════════════════════════════════════════════════════════
export const fetchAllProductsService = async ({
  search, category_id, min_rating, min_price, max_price, page = 1,
  is_featured, supplier_id, admin = false,
}) => {
  const LIMIT  = 12;
  const offset = (page - 1) * LIMIT;

  const conditions = admin === 'true' ? [] : ["p.is_active = true"];
  const values     = [];
  let   i          = 1;

  if (category_id) {
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
      `(p.name_fr ILIKE $${i} OR p.description_fr ILIKE $${i})`
    );
    values.push(`%${search}%`); i++;
  }
  if (min_price) {
      conditions.push(
        `(SELECT MIN(
            CASE
              WHEN vp.discount_type = 'percent' THEN pv2.price * (1 - vp.discount_value / 100)
              WHEN vp.discount_type = 'fixed'   THEN GREATEST(0, pv2.price - vp.discount_value)
              ELSE pv2.price
            END
          )
          FROM product_variants pv2
          LEFT JOIN LATERAL (
            SELECT discount_type, discount_value
            FROM variant_promotions vp2
            WHERE vp2.variant_id = pv2.id
              AND vp2.is_active = true
              AND vp2.starts_at <= NOW()
              AND vp2.expires_at > NOW()
            ORDER BY vp2.created_at DESC LIMIT 1
          ) vp ON true
          WHERE pv2.product_id = p.id AND pv2.is_active = true
        ) >= $${i}`
      );
      values.push(min_price); i++;
  }
  if (max_price) {
      conditions.push(
        `(SELECT MIN(
            CASE
              WHEN vp.discount_type = 'percent' THEN pv2.price * (1 - vp.discount_value / 100)
              WHEN vp.discount_type = 'fixed'   THEN GREATEST(0, pv2.price - vp.discount_value)
              ELSE pv2.price
            END
          )
          FROM product_variants pv2
          LEFT JOIN LATERAL (
            SELECT discount_type, discount_value
            FROM variant_promotions vp2
            WHERE vp2.variant_id = pv2.id
              AND vp2.is_active = true
              AND vp2.starts_at <= NOW()
              AND vp2.expires_at > NOW()
            ORDER BY vp2.created_at DESC LIMIT 1
          ) vp ON true
          WHERE pv2.product_id = p.id AND pv2.is_active = true
        ) <= $${i}`
      );
      values.push(max_price); i++;
  }

  const WHERE        = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues  = [...values];
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
      `SELECT DISTINCT ON (p.id)
         p.id,
         p.name_fr,
         p.slug,
         p.images,
         p.rating_avg,
         p.rating_count,
         p.is_featured,
         p.is_active,
         p.is_new, 
         p.created_at,
         c.id        AS category_id,
         c.name_fr   AS category_name,
         c.slug      AS category_slug,
         s.id        AS supplier_id,
         s.name      AS supplier_name,
         s.slug      AS supplier_slug,
         s.is_certified_bio,
         (SELECT MIN(
            CASE
              WHEN vp.discount_type = 'percent'
                THEN pv2.price * (1 - vp.discount_value / 100)
              WHEN vp.discount_type = 'fixed'
                THEN GREATEST(0, pv2.price - vp.discount_value)
              ELSE pv2.price
            END
          )  
          FROM product_variants pv2
          LEFT JOIN LATERAL (
            SELECT discount_type, discount_value
            FROM variant_promotions vp2
            WHERE vp2.variant_id = pv2.id
              AND vp2.is_active = true
              AND vp2.starts_at <= NOW()
              AND vp2.expires_at > NOW()
            ORDER BY vp2.created_at DESC
            LIMIT 1
          ) vp ON true
          WHERE pv2.product_id = p.id AND pv2.is_active = true
          ) AS min_price,
           (SELECT pv2.id
            FROM product_variants pv2
            WHERE pv2.product_id = p.id AND pv2.is_active = true
            ORDER BY pv2.price ASC LIMIT 1
          ) AS cheapest_variant_id,
         (SELECT COALESCE(SUM(pv2.stock), 0)
          FROM product_variants pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true
         ) AS total_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       ${WHERE}
       ORDER BY p.id, p.created_at DESC
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
// FETCH SINGLE PRODUCT (Admin + Public)
// ✅ Retourne TOUT même si le produit est désactivé quand admin=true
// ═══════════════════════════════════════════════════════════
export const fetchSingleProductService = async (productId, admin = false, alreadyViewed = false) => {
  if (!admin && !alreadyViewed) {
    await database.query(`UPDATE products SET views_count = views_count + 1 WHERE id = $1`, [productId]);
    await database.query(`INSERT INTO product_views (product_id) VALUES ($1)`, [productId]);
  }
  
  const [productResult, variantsResult] = await Promise.all([
    database.query(
      `SELECT
         p.*,
         c.id          AS category_id,
         c.name_fr     AS category_name,
         c.slug        AS category_slug,
         pc.name_fr    AS parent_category_name,
         pc.slug       AS parent_category_slug,
         s.name        AS supplier_name,
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
       WHERE p.id = $1 ${admin ? "" : "AND p.is_active = true"}
       GROUP BY p.id, c.id, c.name_fr, c.slug,
                pc.name_fr, pc.slug,
                s.name,  s.slug, s.description_fr,
                s.region, s.is_certified_bio`,
      [productId]
    ),
    database.query(
      `SELECT
        pv.*,
        active_promo.discount_type  AS promo_type,
        active_promo.discount_value AS promo_value,
        active_promo.expires_at     AS promo_expires_at,
        COALESCE(
          json_agg(
            json_build_object(
              'type_fr',    at.name_fr,
              'unit',       at.unit,
              'value_fr',   av.value_fr,
              'sort_order', av.sort_order
            )
            ORDER BY av.sort_order
          ) FILTER (WHERE at.id IS NOT NULL),
          '[]'
        ) AS attributes
      FROM product_variants pv
      LEFT JOIN product_variant_attributes pva ON pva.variant_id = pv.id
      LEFT JOIN attribute_values           av  ON av.id          = pva.attribute_value_id
      LEFT JOIN attribute_types            at  ON at.id          = av.attribute_type_id
      LEFT JOIN LATERAL (
        SELECT discount_type, discount_value, expires_at
        FROM variant_promotions vp
        WHERE vp.variant_id = pv.id
          AND vp.is_active = true
          AND vp.starts_at <= NOW()
          AND vp.expires_at > NOW()
        ORDER BY vp.created_at DESC
        LIMIT 1
      ) active_promo ON true
      WHERE pv.product_id = $1 ${admin ? "" : "AND pv.is_active = true"}
      GROUP BY pv.id, active_promo.discount_type, active_promo.discount_value, active_promo.expires_at
      ORDER BY pv.price ASC`,
      [productId]
    ),
  ]);

  if (productResult.rows.length === 0) {
    throw new ErrorHandler("Product not found.", 404);
  }

  const product    = productResult.rows[0];
  product.variants = variantsResult.rows || [];

  return product;
};
// ═══════════════════════════════════════════════════════════
// FETCH FEATURED PRODUCTS (homepage)
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedProductsService = async (limit = 8) => {
  const result = await database.query(
    `SELECT DISTINCT ON (p.id)
       p.id,
       p.name_fr,
       p.slug,
       p.images,
       p.rating_avg,
       p.rating_count,
       p.is_featured,
       p.is_new, 
       p.created_at,
       c.id        AS category_id,
       c.name_fr   AS category_name,
       c.slug      AS category_slug,
       s.id        AS supplier_id,
       s.name      AS supplier_name,
       s.slug      AS supplier_slug,
       s.is_certified_bio,
       (SELECT MIN(
          CASE
            WHEN vp.discount_type = 'percent'
              THEN pv2.price * (1 - vp.discount_value / 100)
            WHEN vp.discount_type = 'fixed'
              THEN GREATEST(0, pv2.price - vp.discount_value)
            ELSE pv2.price
          END
        )
        FROM product_variants pv2
        LEFT JOIN LATERAL (
          SELECT discount_type, discount_value
          FROM variant_promotions vp2
          WHERE vp2.variant_id = pv2.id
            AND vp2.is_active = true
            AND vp2.starts_at <= NOW()
            AND vp2.expires_at > NOW()
          ORDER BY vp2.created_at DESC
          LIMIT 1
        ) vp ON true
        WHERE pv2.product_id = p.id AND pv2.is_active = true
        ) AS min_price,
         (SELECT pv2.id
          FROM product_variants pv2
          WHERE pv2.product_id = p.id AND pv2.is_active = true
          ORDER BY pv2.price ASC LIMIT 1
        ) AS cheapest_variant_id,
       (SELECT COALESCE(SUM(pv2.stock), 0)
        FROM product_variants pv2
        WHERE pv2.product_id = p.id AND pv2.is_active = true
       ) AS total_stock
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers  s ON s.id = p.supplier_id
     WHERE p.is_active = true AND p.is_featured = true
     ORDER BY p.id, p.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// UPDATE PRODUCT
// ✅ Now appends new images instead of replacing (your main request)
// ═══════════════════════════════════════════════════════════
export const updateProductService = async ({
  productId, name_fr, description_fr, 
  ethical_info_fr, origin, certifications,
  usage_fr, ingredients_fr, 
  precautions_fr, 
  supplier_id, category_id, slug, is_active, is_featured, is_new,
  files,
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

  // ── NEW BEHAVIOR: ADD new images instead of replacing ──
  if (files && files.images) {
    const newUploaded = await uploadProductImages(files.images);
    images = [...images, ...newUploaded];   // ← append only
  }

  const result = await database.query(
    `UPDATE products SET
       name_fr=$1, 
       description_fr=$2, 
       ethical_info_fr=$3, 
       origin=$4, certifications=$5,
       usage_fr=$6, 
       ingredients_fr=$7, 
       precautions_fr=$8, 
       supplier_id=$9, category_id=$10,
       slug=$11, is_active=$12, is_featured=$13, images=$14,
       is_new=$16 , updated_at=now()
     WHERE id=$15 RETURNING *`,
    [
      name_fr          ?? p.name_fr,
      description_fr   ?? p.description_fr,
      ethical_info_fr  ?? p.ethical_info_fr,
      origin           ?? p.origin,
      certifications   ? JSON.stringify(certifications) : p.certifications,
      usage_fr         ?? p.usage_fr,
      ingredients_fr   ?? p.ingredients_fr,
      precautions_fr   ?? p.precautions_fr,
      supplier_id      ?? p.supplier_id,
      category_id      ?? p.category_id,
      slug             ?? p.slug,
      is_active        ?? p.is_active,
      is_featured      ?? p.is_featured,
      JSON.stringify(images),
      productId,
      is_new ?? p.is_new,
    ]
  );

  return result.rows[0];
};
// ═══════════════════════════════════════════════════════════
// ADD VARIANT
// ═══════════════════════════════════════════════════════════
export const addVariantService = async ({
  productId, price,  cost_price,
  stock, sku, weight_grams, barcode, low_stock_threshold ,attributes,
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
      (product_id, sku, price,  cost_price, stock,low_stock_threshold, weight_grams, barcode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [productId, sku || null, price, cost_price || null,
     stock || 0,  low_stock_threshold || 5, weight_grams || null, barcode || null]
  );
  const variant = variantResult.rows[0];

  const parsedAttrs = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
  if (parsedAttrs && parsedAttrs.length > 0) {
    for (const attr of parsedAttrs) {
      const valueId = await upsertAttribute(attr.type_fr, attr.value_fr);
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
  variantId, price,  cost_price,
  stock, sku,low_stock_threshold ,weight_grams, is_active,
}) => {
  const existing = await database.query(
    "SELECT * FROM product_variants WHERE id = $1", [variantId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Variant not found.", 404);

  const v = existing.rows[0];
 // ✅ Convertir les champs numériques — chaîne vide devient null → fallback sur valeur actuelle
  const safeNum = (val) => {
    if (val === '' || val === null || val === undefined) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const newPrice        = safeNum(price)        ?? v.price;
  const newCostPrice    = safeNum(cost_price)    ?? v.cost_price;
  const newStock        = safeNum(stock)         ?? v.stock;        // ← le coupable
  const newWeightGrams  = safeNum(weight_grams)  ?? v.weight_grams;

  // ✅ Valider que stock n'est pas négatif
  if (newStock < 0)
    throw new ErrorHandler("Le stock ne peut pas être négatif.", 400);

  const result = await database.query(
    `UPDATE product_variants SET
       price=$1,  cost_price=$2,
       stock=$3, sku=$4,low_stock_threshold=$5, weight_grams=$6, is_active=$7,
       updated_at=now()
     WHERE id=$8 RETURNING *`,
    [
      newPrice,
      newCostPrice,
      newStock,
      sku          ?? v.sku,
      low_stock_threshold ?? v.low_stock_threshold,
      newWeightGrams,
      is_active    ?? v.is_active,
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