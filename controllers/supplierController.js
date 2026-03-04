import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import { v2 as cloudinary } from "cloudinary";
import generateSlug from "../utils/generateSlug.js";

// ─────────────────────────────────────────
// CREATE SUPPLIER (admin only)
// POST /api/suppliers
// ─────────────────────────────────────────
export const createSupplier = catchAsyncErrors(async (req, res, next) => {
  const { name, description, address, contact, website } = req.body;

  if (!name)
    return next(new ErrorHandler("Please provide a supplier name.", 400));

  const existing = await database.query(
    "SELECT id FROM suppliers WHERE name ILIKE $1", [name]
  );
  if (existing.rows.length > 0)
    return next(new ErrorHandler("Supplier already exists.", 409));

  const slug = generateSlug(name);
  const slugExists = await database.query(
    "SELECT id FROM suppliers WHERE slug = $1", [slug]
  );
  if (slugExists.rows.length > 0)
    return next(new ErrorHandler("A supplier with a similar name already exists.", 409));

  // Upload images if provided
  let uploadedImages = [];
  if (req.files && req.files.images) {
    const images = Array.isArray(req.files.images)
      ? req.files.images : [req.files.images];
    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Supplier_Images", width: 500, crop: "scale",
      });
      uploadedImages.push({ url: result.secure_url, public_id: result.public_id });
    }
  }

  const supplier = await database.query(
    `INSERT INTO suppliers (name, slug, description, address, contact, website, images)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, slug, description || null, address || null,
     contact || null, website || null, JSON.stringify(uploadedImages)]
  );

  res.status(201).json({
    success:  true,
    message:  "Supplier created successfully.",
    supplier: supplier.rows[0],
  });
});

// ─────────────────────────────────────────
// FETCH ALL SUPPLIERS (admin only)
// GET /api/suppliers
// ─────────────────────────────────────────
export const fetchAllSuppliers = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT s.*, COUNT(p.id) AS product_count
     FROM suppliers s
     LEFT JOIN products p ON p.supplier_name ILIKE s.name
     GROUP BY s.id
     ORDER BY s.created_at DESC`
  );

  res.status(200).json({
    success:        true,
    totalSuppliers: result.rows.length,
    suppliers:      result.rows,
  });
});

// ─────────────────────────────────────────
// FETCH SUPPLIER BY SLUG (public)
// GET /api/suppliers/:slug
// This is the public profile page the user
// lands on after clicking the supplier name
// in a product description
// ─────────────────────────────────────────
export const fetchSupplierBySlug = catchAsyncErrors(async (req, res, next) => {
  const { slug } = req.params;

  const result = await database.query(
    `SELECT
       s.*,
       -- All products from this supplier
       COALESCE(
         json_agg(
           json_build_object(
             'id',      p.id,
             'name',    p.name,
             'price',   p.price,
             'ratings', p.ratings,
             'images',  p.images
           )
         ) FILTER (WHERE p.id IS NOT NULL AND p.status = 'approved'), '[]'
       ) AS products
     FROM suppliers s
     LEFT JOIN products p ON p.supplier_name ILIKE s.name
     WHERE s.slug = $1
     GROUP BY s.id`,
    [slug]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Supplier not found.", 404));

  res.status(200).json({
    success:  true,
    supplier: result.rows[0],
  });
});

// ─────────────────────────────────────────
// UPDATE SUPPLIER (admin only)
// PUT /api/suppliers/:supplierId
// ─────────────────────────────────────────
export const updateSupplier = catchAsyncErrors(async (req, res, next) => {
  const { supplierId } = req.params;
  const { name, description, address, contact, website } = req.body;

  const supplier = await database.query(
    "SELECT * FROM suppliers WHERE id = $1", [supplierId]
  );
  if (supplier.rows.length === 0)
    return next(new ErrorHandler("Supplier not found.", 404));

  const duplicate = await database.query(
    "SELECT id FROM suppliers WHERE name ILIKE $1 AND id != $2", [name, supplierId]
  );
  if (duplicate.rows.length > 0)
    return next(new ErrorHandler("Supplier name already taken.", 409));

  const slug = generateSlug(name);
  const slugExists = await database.query(
    "SELECT id FROM suppliers WHERE slug=$1 AND id!=$2", [slug, supplierId]
  );
  if (slugExists.rows.length > 0)
    return next(new ErrorHandler("A similar supplier name already exists.", 409));

  // Handle new images
  let uploadedImages = supplier.rows[0].images || [];
  if (req.files && req.files.images) {
    for (const image of uploadedImages) {
      if (image.public_id) await cloudinary.uploader.destroy(image.public_id);
    }
    uploadedImages = [];
    const images = Array.isArray(req.files.images)
      ? req.files.images : [req.files.images];
    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Supplier_Images", width: 500, crop: "scale",
      });
      uploadedImages.push({ url: result.secure_url, public_id: result.public_id });
    }
  }

  const updated = await database.query(
    `UPDATE suppliers
     SET name=$1, slug=$2, description=$3,
         address=$4, contact=$5, website=$6, images=$7
     WHERE id=$8 RETURNING *`,
    [name, slug, description || null, address || null,
     contact || null, website || null,
     JSON.stringify(uploadedImages), supplierId]
  );

  res.status(200).json({
    success:  true,
    message:  "Supplier updated successfully.",
    supplier: updated.rows[0],
  });
});

// ─────────────────────────────────────────
// DELETE SUPPLIER (admin only)
// DELETE /api/suppliers/:supplierId
// Sets supplier_name to NULL on products
// ─────────────────────────────────────────
export const deleteSupplier = catchAsyncErrors(async (req, res, next) => {
  const { supplierId } = req.params;

  const supplier = await database.query(
    "SELECT * FROM suppliers WHERE id = $1", [supplierId]
  );
  if (supplier.rows.length === 0)
    return next(new ErrorHandler("Supplier not found.", 404));

  // Set supplier_name to NULL on all linked products
  await database.query(
    "UPDATE products SET supplier_name = NULL WHERE supplier_name ILIKE $1",
    [supplier.rows[0].name]
  );

  const deleted = await database.query(
    "DELETE FROM suppliers WHERE id=$1 RETURNING *", [supplierId]
  );

  // Delete images from Cloudinary
  for (const image of deleted.rows[0].images || []) {
    if (image.public_id) await cloudinary.uploader.destroy(image.public_id);
  }

  res.status(200).json({ success: true, message: "Supplier deleted successfully." });
});