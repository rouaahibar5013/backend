import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache, invalidateDashboardCache } from "../utils/cacheInvalideation.js"; // ✅ ajout

// ═══════════════════════════════════════════════════════════
// HELPER — generate unique slug from french name
// ═══════════════════════════════════════════════════════════
const generateSlug = async (name_fr, excludeId = null) => {
  const base = name_fr
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const query = excludeId
    ? "SELECT id FROM categories WHERE slug=$1 AND id!=$2"
    : "SELECT id FROM categories WHERE slug=$1";
  const params = excludeId ? [base, excludeId] : [base];

  const exists = await database.query(query, params);
  return exists.rows.length > 0 ? `${base}-${Date.now()}` : base;
};

// ═══════════════════════════════════════════════════════════
// HELPER — upload category images
// ═══════════════════════════════════════════════════════════
const uploadCategoryImages = async (imageFiles) => {
  const imgs = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    imgs.map(img =>
      cloudinary.uploader.upload(img.tempFilePath, {
        folder: "Ecommerce_Category_Images",
        width:  500,
        crop:   "scale",
      })
    )
  );
  return uploaded.map(r => ({ url: r.secure_url, public_id: r.public_id }));
};

// ═══════════════════════════════════════════════════════════
// CREATE CATEGORY
// ═══════════════════════════════════════════════════════════
export const createCategoryService = async ({
  name_fr,  description_fr,  parent_id, files,
}) => {
  // Check duplicate
  const existing = await database.query(
    "SELECT id FROM categories WHERE name_fr ILIKE $1", [name_fr]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler("Cette catégorie existe déjà.", 409);

  // Validate parent
  if (parent_id) {
    const parent = await database.query(
      "SELECT id FROM categories WHERE id=$1", [parent_id]
    );
    if (parent.rows.length === 0)
      throw new ErrorHandler("Catégorie parente introuvable.", 404);
  }

  const slug = await generateSlug(name_fr);

  // Upload images
  let images = [];
  if (files?.images) {
    images = await uploadCategoryImages(files.images);
  }

  const result = await database.query(
    `INSERT INTO categories
      (name_fr,  slug, description_fr, images, parent_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      name_fr, slug,
      description_fr || null, 
      JSON.stringify(images), parent_id || null,
    ]
  );
await invalidateOffresCache();    // ✅ nouvelle catégorie → page offres
  await invalidateDashboardCache();
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// FETCH ALL CATEGORIES
// Returns nested tree : root categories with children[]
// ═══════════════════════════════════════════════════════════
export const fetchAllCategoriesService = async () => {
  const result = await database.query(
    `SELECT
       c.id,
       c.name_fr,
       c.slug,
       c.description_fr,
       c.images,
       c.parent_id,
       c.sort_order,
       c.is_active,
       COUNT(DISTINCT p.id) AS product_count,
       par.name_fr          AS parent_name_fr,
       par.slug             AS parent_slug
     FROM categories c
     LEFT JOIN products   p   ON p.category_id = c.id AND p.is_active = true
     LEFT JOIN categories par ON par.id = c.parent_id
     WHERE c.is_active = true
     GROUP BY c.id, par.name_fr, par.slug
     ORDER BY c.sort_order ASC, c.name_fr ASC`
  );

 const all = result.rows.map(row => ({
    ...row,
    product_count: parseInt(row.product_count) || 0,
    images: typeof row.images === 'string'
        ? JSON.parse(row.images)
        : row.images ?? [],
}));
  const roots = all.filter(c => c.parent_id === null);

  // Nest subcategories inside their parent
  roots.forEach(root => {
    root.children = all.filter(c => c.parent_id === root.id);
  });

  return { categories: roots, total: all.length };
};

// ═══════════════════════════════════════════════════════════
// FETCH SINGLE CATEGORY
// Returns category + subcategories
// ═══════════════════════════════════════════════════════════
export const fetchSingleCategoryService = async (categoryId) => {
  const result = await database.query(
    `SELECT
       c.*,
       par.name_fr AS parent_name_fr,
       par.slug    AS parent_slug,
       COALESCE(
         json_agg(DISTINCT jsonb_build_object(
           'id',      sub.id,
           'name_fr', sub.name_fr,
           'slug',    sub.slug,
           'images',  sub.images
         )) FILTER (WHERE sub.id IS NOT NULL AND sub.is_active = true),
         '[]'
       ) AS subcategories
     FROM categories c
     LEFT JOIN categories par ON par.id         = c.parent_id
     LEFT JOIN categories sub ON sub.parent_id  = c.id
     WHERE c.id = $1
     GROUP BY c.id, par.name_fr, par.slug`,
    [categoryId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Catégorie introuvable.", 404);

  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// UPDATE CATEGORY
// ═══════════════════════════════════════════════════════════
export const updateCategoryService = async ({
  categoryId, name_fr, 
  description_fr,
  parent_id, is_active, sort_order, files,
}) => {
  const existing = await database.query(
    "SELECT * FROM categories WHERE id=$1", [categoryId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Catégorie introuvable.", 404);

  const c = existing.rows[0];

  if (parent_id && parent_id === categoryId)
    throw new ErrorHandler("Une catégorie ne peut pas être son propre parent.", 400);

  if (parent_id) {
    const parent = await database.query(
      "SELECT id FROM categories WHERE id=$1", [parent_id]
    );
    if (parent.rows.length === 0)
      throw new ErrorHandler("Catégorie parente introuvable.", 404);
  }

  // Handle images
  let images = c.images || [];
  if (files?.images) {
    await Promise.all(
      images.filter(i => i.public_id)
            .map(i => cloudinary.uploader.destroy(i.public_id))
    );
    images = await uploadCategoryImages(files.images);
  }

  const result = await database.query(
    `UPDATE categories SET
       name_fr=$1, 
       description_fr=$2, 
       parent_id=$3, images=$4,
       is_active=$5, sort_order=$6,
       updated_at=now()
     WHERE id=$7
     RETURNING *`,
    [
      name_fr        ?? c.name_fr,
      description_fr ?? c.description_fr,
      parent_id      ?? c.parent_id,
      JSON.stringify(images),
      is_active      !== undefined ? is_active === 'true' || is_active === true : c.is_active,
      sort_order     ?? c.sort_order,
      categoryId,
    ]
  );
await invalidateOffresCache();    // ✅ nouvelle catégorie → page offres
  await invalidateDashboardCache();
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// DELETE CATEGORY
// Blocked if products or subcategories exist
// ═══════════════════════════════════════════════════════════
export const deleteCategoryService = async (categoryId) => {
  const existing = await database.query(
    "SELECT * FROM categories WHERE id=$1", [categoryId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Catégorie introuvable.", 404);

  // Check dependencies in parallel
  const [products, children] = await Promise.all([
    database.query("SELECT COUNT(*) FROM products WHERE category_id=$1", [categoryId]),
    database.query("SELECT COUNT(*) FROM categories WHERE parent_id=$1", [categoryId]),
  ]);

  if (parseInt(products.rows[0].count) > 0)
    throw new ErrorHandler("Impossible : des produits sont liés à cette catégorie.", 400);
  if (parseInt(children.rows[0].count) > 0)
    throw new ErrorHandler("Impossible : des sous-catégories existent.", 400);

  const deleted = await database.query(
    "DELETE FROM categories WHERE id=$1 RETURNING *", [categoryId]
  );

  // Delete images from Cloudinary in parallel
  await Promise.all(
    (deleted.rows[0].images || [])
      .filter(i => i.public_id)
      .map(i => cloudinary.uploader.destroy(i.public_id))
  );
  await invalidateOffresCache();    // ✅ nouvelle catégorie → page offres
  await invalidateDashboardCache();
};