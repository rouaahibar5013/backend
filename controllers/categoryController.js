import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import generateSlug from "../utils/generateSlug.js";

// ─────────────────────────────────────────
// CREATE CATEGORY (admin only)
// POST /api/categories
// parent_id is optional — if provided this
// becomes a subcategory
// ─────────────────────────────────────────
export const createCategory = catchAsyncErrors(async (req, res, next) => {
  const { name, description, parent_id } = req.body;

  if (!name)
    return next(new ErrorHandler("Please provide a category name.", 400));

  // Check duplicate name
  const existing = await database.query(
    "SELECT id FROM categories WHERE name ILIKE $1", [name]
  );
  if (existing.rows.length > 0)
    return next(new ErrorHandler("Category already exists.", 409));

  // If parent_id provided verify it exists
  if (parent_id) {
    const parent = await database.query(
      "SELECT id FROM categories WHERE id = $1", [parent_id]
    );
    if (parent.rows.length === 0)
      return next(new ErrorHandler("Parent category not found.", 404));
  }

  // Generate and check slug uniqueness
  const slug = generateSlug(name);
  const slugExists = await database.query(
    "SELECT id FROM categories WHERE slug = $1", [slug]
  );
  if (slugExists.rows.length > 0)
    return next(new ErrorHandler("A similar category name already exists.", 409));

  // Upload images if provided
  let uploadedImages = [];
  if (req.files && req.files.images) {
    const images = Array.isArray(req.files.images)
      ? req.files.images : [req.files.images];

    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Category_Images",
        width: 500, crop: "scale",
      });
      uploadedImages.push({ url: result.secure_url, public_id: result.public_id });
    }
  }

  const category = await database.query(
    `INSERT INTO categories (name, slug, description, images, parent_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, slug, description || null, JSON.stringify(uploadedImages), parent_id || null]
  );

  res.status(201).json({
    success:  true,
    message:  "Category created successfully.",
    category: category.rows[0],
  });
});

// ─────────────────────────────────────────
// FETCH ALL CATEGORIES (public)
// GET /api/categories
// Returns categories with their subcategories
// nested inside as a "children" array
// ─────────────────────────────────────────
export const fetchAllCategories = catchAsyncErrors(async (req, res, next) => {
  // Fetch all categories in one query
  const result = await database.query(
    `SELECT
       c.*,
       COUNT(DISTINCT p.id) AS product_count,
       parent.name          AS parent_name,
       parent.slug          AS parent_slug
     FROM categories c
     LEFT JOIN products   p      ON p.category_id = c.id AND p.status = 'approved'
     LEFT JOIN categories parent ON parent.id      = c.parent_id
     GROUP BY c.id, parent.name, parent.slug
     ORDER BY c.created_at ASC`
  );

  const allCategories = result.rows;

  // Build a nested tree structure
  // Root categories contain their subcategories in a "children" array
  const roots = allCategories.filter(c => c.parent_id === null);
  roots.forEach(root => {
    root.children = allCategories.filter(c => c.parent_id === root.id);
  });

  res.status(200).json({
    success:          true,
    totalCategories:  allCategories.length,
    categories:       roots, // nested tree
  });
});

// ─────────────────────────────────────────
// FETCH SINGLE CATEGORY (public)
// GET /api/categories/:categoryId
// Returns category + its subcategories
// + all products in this category
// ─────────────────────────────────────────
export const fetchSingleCategory = catchAsyncErrors(async (req, res, next) => {
  const { categoryId } = req.params;

  const result = await database.query(
    `SELECT
       c.*,
       parent.name AS parent_name,
       parent.slug AS parent_slug,
       -- Subcategories of this category
       COALESCE(
         json_agg(DISTINCT
           jsonb_build_object('id', sub.id, 'name', sub.name, 'slug', sub.slug)
         ) FILTER (WHERE sub.id IS NOT NULL), '[]'
       ) AS subcategories,
       -- Products in this category
       COALESCE(
         json_agg(DISTINCT
           jsonb_build_object(
             'id', p.id, 'name', p.name,
             'price', p.price, 'ratings', p.ratings, 'images', p.images
           )
         ) FILTER (WHERE p.id IS NOT NULL AND p.status = 'approved'), '[]'
       ) AS products
     FROM categories c
     LEFT JOIN categories parent ON parent.id      = c.parent_id
     LEFT JOIN categories sub    ON sub.parent_id  = c.id
     LEFT JOIN products   p      ON p.category_id  = c.id
     WHERE c.id = $1
     GROUP BY c.id, parent.name, parent.slug`,
    [categoryId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Category not found.", 404));

  res.status(200).json({
    success:  true,
    category: result.rows[0],
  });
});

// ─────────────────────────────────────────
// UPDATE CATEGORY (admin only)
// PUT /api/categories/:categoryId
// ─────────────────────────────────────────
export const updateCategory = catchAsyncErrors(async (req, res, next) => {
  const { categoryId }          = req.params;
  const { name, description, parent_id } = req.body;

  if (!name)
    return next(new ErrorHandler("Please provide a category name.", 400));

  const category = await database.query(
    "SELECT * FROM categories WHERE id = $1", [categoryId]
  );
  if (category.rows.length === 0)
    return next(new ErrorHandler("Category not found.", 404));

  // Check duplicate name excluding self
  const duplicate = await database.query(
    "SELECT id FROM categories WHERE name ILIKE $1 AND id != $2", [name, categoryId]
  );
  if (duplicate.rows.length > 0)
    return next(new ErrorHandler("Category name already taken.", 409));

  // Cannot be its own parent
  if (parent_id && parent_id === categoryId)
    return next(new ErrorHandler("A category cannot be its own parent.", 400));

  if (parent_id) {
    const parent = await database.query(
      "SELECT id FROM categories WHERE id = $1", [parent_id]
    );
    if (parent.rows.length === 0)
      return next(new ErrorHandler("Parent category not found.", 404));
  }

  // Regenerate slug and check uniqueness excluding self
  const slug = generateSlug(name);
  const slugExists = await database.query(
    "SELECT id FROM categories WHERE slug=$1 AND id!=$2", [slug, categoryId]
  );
  if (slugExists.rows.length > 0)
    return next(new ErrorHandler("A similar category name already exists.", 409));

  // Handle new images if uploaded
  let uploadedImages = category.rows[0].images || [];
  if (req.files && req.files.images) {
    // Delete old images from Cloudinary
    for (const image of uploadedImages) {
      if (image.public_id) await cloudinary.uploader.destroy(image.public_id);
    }
    uploadedImages = [];
    const images = Array.isArray(req.files.images)
      ? req.files.images : [req.files.images];
    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Category_Images", width: 500, crop: "scale",
      });
      uploadedImages.push({ url: result.secure_url, public_id: result.public_id });
    }
  }

  const updated = await database.query(
    `UPDATE categories
     SET name=$1, slug=$2, description=$3, images=$4, parent_id=$5
     WHERE id=$6 RETURNING *`,
    [name, slug, description || null,
     JSON.stringify(uploadedImages), parent_id || null, categoryId]
  );

  res.status(200).json({
    success:  true,
    message:  "Category updated successfully.",
    category: updated.rows[0],
  });
});

// ─────────────────────────────────────────
// DELETE CATEGORY (admin only)
// DELETE /api/categories/:categoryId
// Blocked if products or subcategories exist
// ─────────────────────────────────────────
export const deleteCategory = catchAsyncErrors(async (req, res, next) => {
  const { categoryId } = req.params;

  const category = await database.query(
    "SELECT * FROM categories WHERE id = $1", [categoryId]
  );
  if (category.rows.length === 0)
    return next(new ErrorHandler("Category not found.", 404));

  // Block if products still use this category
  const linkedProducts = await database.query(
    "SELECT COUNT(*) FROM products WHERE category_id = $1", [categoryId]
  );
  if (parseInt(linkedProducts.rows[0].count) > 0)
    return next(new ErrorHandler("Cannot delete: products are assigned to this category.", 400));

  // Block if subcategories still exist under this category
  const linkedChildren = await database.query(
    "SELECT COUNT(*) FROM categories WHERE parent_id = $1", [categoryId]
  );
  if (parseInt(linkedChildren.rows[0].count) > 0)
    return next(new ErrorHandler("Cannot delete: subcategories exist under this category.", 400));

  const deleted = await database.query(
    "DELETE FROM categories WHERE id=$1 RETURNING *", [categoryId]
  );

  // Delete images from Cloudinary
  for (const image of deleted.rows[0].images || []) {
    if (image.public_id) await cloudinary.uploader.destroy(image.public_id);
  }

  res.status(200).json({ success: true, message: "Category deleted successfully." });
});