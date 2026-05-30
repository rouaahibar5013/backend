import { Supplier } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache } from "../utils/cacheInvalideation.js";
import fs   from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

// ─── Helpers ──────────────────────────────────────────
const uploadSupplierImages = async (imageFiles) => {
  const imgs = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    imgs.map(async (img) => {
      const filename = `${uuidv4()}.webp`;
      const filepath = path.join(UPLOAD_DIR, filename);
      await sharp(img.tempFilePath)
        .resize({ width: 500, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);
      return { url: `/uploads/suppliers/${filename}`, filename };
    })
  );
  return uploaded;
};

const deleteSupplierImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filepath, (err) => {
    if (err) console.error("Erreur suppression image fournisseur:", err.message);
  });
};

const generateSlug = async (name, excludeId = null) => {
  const base = name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const exists = await Supplier.findBySlugExcludingId(base, excludeId);
  return exists ? `${base}-${Date.now()}` : base;
};


// ══════════════════════════════════════════════════════
// CREATE
// ══════════════════════════════════════════════════════
export const createSupplierService = async ({
  name, description_fr,
  region, address, contact, email, website,
  is_certified_bio, files,
}) => {
  const existing = await Supplier.findByName(name);
  if (existing) throw new ErrorHandler("Ce fournisseur existe déjà.", 409);

  const slug   = await generateSlug(name);
  let   images = [];
  if (files?.images) images = await uploadSupplierImages(files.images);

  const supplier = await Supplier.create({
    name, slug, description_fr: description_fr || null,
    region: region || null, address: address || null,
    contact: contact || null, email: email || null,
    website: website || null,
    is_certified_bio: is_certified_bio === 'true' || is_certified_bio === true,
    logo_url: images[0]?.url || null,
  });

  await invalidateOffresCache();
  return supplier;
};


// ══════════════════════════════════════════════════════
// FETCH ALL
// ══════════════════════════════════════════════════════
export const fetchAllSuppliersService = async () => {
  return await Supplier.findAllWithProductCount();
};


// ══════════════════════════════════════════════════════
// FETCH BY SLUG
// ══════════════════════════════════════════════════════
export const fetchSupplierBySlugService = async (slug) => {
  console.log("[supplierService] slug reçu:", slug);

  const supplier = await Supplier.findBySlugWithProducts(slug);

  console.log("[supplierService] supplier trouvé:", !!supplier);

  if (!supplier) throw new ErrorHandler("Fournisseur introuvable.", 404);
  return supplier;
};


// ══════════════════════════════════════════════════════
// UPDATE
// ══════════════════════════════════════════════════════
export const updateSupplierService = async ({
  supplierId, name, description_fr,
  region, address, contact, email, website,
  is_certified_bio, is_active, files,
}) => {
  const s = await Supplier.findById(supplierId);
  if (!s) throw new ErrorHandler("Fournisseur introuvable.", 404);

  if (name && name !== s.name) {
    const duplicate = await Supplier.findByNameExcludingId(name, supplierId);
    if (duplicate) throw new ErrorHandler("Un fournisseur avec ce nom existe déjà.", 409);
  }

  let logoUrl = s.logo_url;
 if (files?.images) {
    deleteSupplierImage(logoUrl);                        // ✅
    const uploaded = await uploadSupplierImages(files.images);
    logoUrl = uploaded[0]?.url || logoUrl;
}

  const updated = await Supplier.updateFull(supplierId, {
    name:            name            ?? s.name,
    description_fr:  description_fr  ?? s.description_fr,
    region:          region          ?? s.region,
    address:         address         ?? s.address,
    contact:         contact         ?? s.contact,
    email:           email           ?? s.email,
    website:         website         ?? s.website,
    is_certified_bio: is_certified_bio !== undefined
      ? is_certified_bio === 'true' || is_certified_bio === true
      : s.is_certified_bio,
    is_active: is_active !== undefined
      ? is_active === 'true' || is_active === true
      : s.is_active,
    logo_url: logoUrl,
  });

  await invalidateOffresCache();
  return updated;
};


// ══════════════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════════════
export const deleteSupplierService = async (supplierId) => {
  const s = await Supplier.findById(supplierId);
  if (!s) throw new ErrorHandler("Fournisseur introuvable.", 404);

  await Supplier.unlinkProducts(supplierId);
  await Supplier.delete(supplierId);
deleteSupplierImage(s.logo_url);
  await invalidateOffresCache();
};