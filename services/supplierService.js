import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

const uploadSupplierImages = async (imageFiles) => {
  const imgs = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    imgs.map(img =>
      cloudinary.uploader.upload(img.tempFilePath, {
        folder: "Ecommerce_Supplier_Images",
        width: 500,
        crop: "scale",
      })
    )
  );
  return uploaded.map(r => ({ url: r.secure_url, public_id: r.public_id }));
};

const generateSlug = async (name, excludeId = null) => {
  const base = name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const query = excludeId
    ? "SELECT id FROM suppliers WHERE slug=$1 AND id!=$2"
    : "SELECT id FROM suppliers WHERE slug=$1";
  const params = excludeId ? [base, excludeId] : [base];
  const exists = await database.query(query, params);
  return exists.rows.length > 0 ? `${base}-${Date.now()}` : base;
};

export const createSupplierService = async ({
  name, name_ar, description_fr, description_ar,
  region, address, contact, email, website,
  is_certified_bio, files,
}) => {
  const existing = await database.query(
    "SELECT id FROM suppliers WHERE name ILIKE $1", [name]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler("Ce fournisseur existe déjà.", 409);

  const slug = await generateSlug(name);

  let images = [];
  if (files?.images) images = await uploadSupplierImages(files.images);

  const result = await database.query(
    `INSERT INTO suppliers
      (name, name_ar, slug, description_fr, description_ar,
       region, address, contact, email, website, is_certified_bio, logo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      name, name_ar || null, slug,
      description_fr || null, description_ar || null,
      region || null, address || null,
      contact || null, email || null, website || null,
      is_certified_bio === 'true' || is_certified_bio === true,
      images[0]?.url || null,
    ]
  );
  return result.rows[0];
};

export const fetchAllSuppliersService = async () => {
  const result = await database.query(
    `SELECT
       s.id, s.name, s.name_ar, s.slug,
       s.description_fr, s.description_ar,
       s.region, s.address, s.contact,
       s.email, s.website, s.logo_url,
       s.is_certified_bio, s.is_active,
       COUNT(DISTINCT p.id) AS product_count
     FROM suppliers s
     LEFT JOIN products p ON p.supplier_id = s.id AND p.is_active = true
     WHERE s.is_active = true
     GROUP BY s.id
     ORDER BY s.name ASC`
  );
  return result.rows;
};

export const fetchSupplierBySlugService = async (slug) => {
  console.log("[supplierService] slug reçu:", slug);

  const supplierResult = await database.query(
    `SELECT s.*, COUNT(DISTINCT p.id) AS product_count
     FROM suppliers s
     LEFT JOIN products p ON p.supplier_id = s.id AND p.is_active = true
     WHERE s.slug = $1
     GROUP BY s.id`,
    [slug]
  );

  console.log("[supplierService] rows trouvées:", supplierResult.rows.length);

  if (supplierResult.rows.length === 0)
    throw new ErrorHandler("Fournisseur introuvable.", 404);

  const supplier = supplierResult.rows[0];
  console.log("[supplierService] supplier.id:", supplier.id);

  const productsResult = await database.query(
    `SELECT
       p.id, p.name_fr, p.name_ar, p.slug,
       p.images, p.rating_avg, p.rating_count, p.is_featured,
       (SELECT MIN(pv.price) FROM product_variants pv
        WHERE pv.product_id = p.id) AS min_price,
       (SELECT COALESCE(SUM(pv.stock), 0) FROM product_variants pv
        WHERE pv.product_id = p.id) AS total_stock,
       c.name_fr AS category_name,
       c.slug    AS category_slug
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.supplier_id = $1 AND p.is_active = true
     ORDER BY p.created_at DESC`,
    [supplier.id]
  );

  console.log("[supplierService] products trouvés:", productsResult.rows.length);

  supplier.products = productsResult.rows;
  return supplier;
};

export const updateSupplierService = async ({
  supplierId, name, name_ar, description_fr, description_ar,
  region, address, contact, email, website,
  is_certified_bio, is_active, files,
}) => {
  const existing = await database.query(
    "SELECT * FROM suppliers WHERE id=$1", [supplierId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Fournisseur introuvable.", 404);

  const s = existing.rows[0];

  if (name && name !== s.name) {
    const duplicate = await database.query(
      "SELECT id FROM suppliers WHERE name ILIKE $1 AND id!=$2", [name, supplierId]
    );
    if (duplicate.rows.length > 0)
      throw new ErrorHandler("Un fournisseur avec ce nom existe déjà.", 409);
  }

  let logoUrl = s.logo_url;
  if (files?.images) {
    if (logoUrl) {
      const matches = logoUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      if (matches) await cloudinary.uploader.destroy(matches[1]);
    }
    const uploaded = await uploadSupplierImages(files.images);
    logoUrl = uploaded[0]?.url || logoUrl;
  }

  const result = await database.query(
    `UPDATE suppliers SET
       name=$1, name_ar=$2, description_fr=$3, description_ar=$4,
       region=$5, address=$6, contact=$7, email=$8, website=$9,
       is_certified_bio=$10, is_active=$11, logo_url=$12, updated_at=now()
     WHERE id=$13 RETURNING *`,
    [
      name ?? s.name, name_ar ?? s.name_ar,
      description_fr ?? s.description_fr, description_ar ?? s.description_ar,
      region ?? s.region, address ?? s.address, contact ?? s.contact,
      email ?? s.email, website ?? s.website,
      is_certified_bio !== undefined
        ? is_certified_bio === 'true' || is_certified_bio === true
        : s.is_certified_bio,
      is_active !== undefined
        ? is_active === 'true' || is_active === true
        : s.is_active,
      logoUrl, supplierId,
    ]
  );
  return result.rows[0];
};

export const deleteSupplierService = async (supplierId) => {
  const existing = await database.query(
    "SELECT * FROM suppliers WHERE id=$1", [supplierId]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Fournisseur introuvable.", 404);

  const s = existing.rows[0];

  await database.query(
    "UPDATE products SET supplier_id=NULL WHERE supplier_id=$1", [supplierId]
  );
  await database.query("DELETE FROM suppliers WHERE id=$1", [supplierId]);

  if (s.logo_url) {
    const matches = s.logo_url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (matches) await cloudinary.uploader.destroy(matches[1]);
  }
};