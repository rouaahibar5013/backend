import fs   from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { Category } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache, invalidateDashboardCache } from "../utils/cacheInvalideation.js";

const UPLOAD_DIR = path.resolve("public/uploads/categories");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// ─── Helpers ──────────────────────────────────────────────
const uploadCategoryImages = async (imageFiles) => {
  const imgs = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    imgs.map(async (img) => {
      const filename = `${uuidv4()}.webp`;
      const filepath = path.join(UPLOAD_DIR, filename);
      await sharp(img.tempFilePath)
        .resize({ width: 500, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);
      return { url: `/uploads/categories/${filename}`, filename };
    })
  );
  return uploaded;
};

const deleteImages = (images = []) => {
  images
    .filter(img => img.filename)
    .forEach(img => {
      const filepath = path.join(UPLOAD_DIR, img.filename);
      fs.unlink(filepath, (err) => {
        if (err) console.error("Erreur suppression image catégorie:", err.message);
      });
    });
};


// ═══════════════════════════════════════════════════════════
// CREATE CATEGORY
// ═══════════════════════════════════════════════════════════
export const createCategoryService = async ({ name_fr, description_fr, parent_id, files }) => {
  const existing = await Category.findByName(name_fr);
  if (existing) throw new ErrorHandler("Cette catégorie existe déjà.", 409);

  if (parent_id) {
    const parent = await Category.findById(parent_id);
    if (!parent) throw new ErrorHandler("Catégorie parente introuvable.", 404);
  }

  const slug   = await Category.generateSlug(name_fr);
  let   images = [];
  if (files?.images) images = await uploadCategoryImages(files.images);

  const category = await Category.create({
    name_fr, slug,
    description_fr: description_fr || null,
    images:         JSON.stringify(images),
    parent_id:      parent_id || null,
  });

  await invalidateOffresCache();
  await invalidateDashboardCache();
  return category;
};


// ═══════════════════════════════════════════════════════════
// FETCH ALL CATEGORIES
// ═══════════════════════════════════════════════════════════
export const fetchAllCategoriesService = async () => {
  const all = await Category.findAllWithTree();

  const roots = all.filter(c => c.parent_id === null);
  roots.forEach(root => {
    root.children = all.filter(c => c.parent_id === root.id);
  });

  return { categories: roots, total: all.length };
};


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE CATEGORY
// ═══════════════════════════════════════════════════════════
export const fetchSingleCategoryService = async (categoryId) => {
  const category = await Category.findByIdWithSubcategories(categoryId);
  if (!category) throw new ErrorHandler("Catégorie introuvable.", 404);
  return category;
};


// ═══════════════════════════════════════════════════════════
// UPDATE CATEGORY
// ═══════════════════════════════════════════════════════════
export const updateCategoryService = async ({
  categoryId, name_fr, description_fr,
  parent_id, is_active, files,
}) => {
  const c = await Category.findById(categoryId);
  if (!c) throw new ErrorHandler("Catégorie introuvable.", 404);

  if (parent_id && parent_id === categoryId)
    throw new ErrorHandler("Une catégorie ne peut pas être son propre parent.", 400);

  if (parent_id) {
    const parent = await Category.findById(parent_id);
    if (!parent) throw new ErrorHandler("Catégorie parente introuvable.", 404);
  }

  let images = c.images || [];
if (files?.images) {
  deleteImages(images);                              // ✅
  images = await uploadCategoryImages(files.images);
}

  const updated = await Category.updateFull(categoryId, {
    name_fr:        name_fr        ?? c.name_fr,
    description_fr: description_fr ?? c.description_fr,
    parent_id:      parent_id      ?? c.parent_id,
    images:         JSON.stringify(images),
    is_active:      is_active !== undefined
      ? is_active === 'true' || is_active === true
      : c.is_active,
  });

  await invalidateOffresCache();
  await invalidateDashboardCache();
  return updated;
};


// ═══════════════════════════════════════════════════════════
// DELETE CATEGORY
// ═══════════════════════════════════════════════════════════
export const deleteCategoryService = async (categoryId) => {
  const c = await Category.findById(categoryId);
  if (!c) throw new ErrorHandler("Catégorie introuvable.", 404);

  const [productCount, childrenCount] = await Promise.all([
    Category.countProducts(categoryId),
    Category.countChildren(categoryId),
  ]);

  if (productCount > 0)
    throw new ErrorHandler("Impossible : des produits sont liés à cette catégorie.", 400);
  if (childrenCount > 0)
    throw new ErrorHandler("Impossible : des sous-catégories existent.", 400);
await Category.delete(categoryId);
deleteImages(c.images || [])

  await invalidateOffresCache();
  await invalidateDashboardCache();
};