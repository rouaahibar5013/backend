import { v2 as cloudinary } from "cloudinary";
import { Category } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache, invalidateDashboardCache } from "../utils/cacheInvalideation.js";


// ─── Helpers ──────────────────────────────────────────────
const uploadCategoryImages = async (imageFiles) => {
  const imgs = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
  const uploaded = await Promise.all(
    imgs.map(img =>
      cloudinary.uploader.upload(img.tempFilePath, {
        folder: "Ecommerce_Category_Images", width: 500, crop: "scale",
      })
    )
  );
  return uploaded.map(r => ({ url: r.secure_url, public_id: r.public_id }));
};

const destroyImages = async (images = []) => {
  await Promise.all(
    images.filter(i => i.public_id).map(i => cloudinary.uploader.destroy(i.public_id))
  );
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
  parent_id, is_active, sort_order, files,
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
    await destroyImages(images);
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
    sort_order:     sort_order ?? c.sort_order,
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
  await destroyImages(c.images || []);

  await invalidateOffresCache();
  await invalidateDashboardCache();
};