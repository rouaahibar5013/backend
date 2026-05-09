import { v2 as cloudinary } from "cloudinary";
import {
  Product, ProductVariant, ProductVariantAttribute,
  AttributeType, Category, Supplier,
} from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache, invalidateDashboardCache } from "../utils/cacheInvalideation.js";


// ─── Helpers ──────────────────────────────────────────────
const uploadProductImages = async (imageFiles) => {
  const images = Array.isArray(imageFiles) ? imageFiles : [imageFiles];

  const uploaded = await Promise.all(
    images.map(img =>
      cloudinary.uploader.upload(img.tempFilePath, {
        folder: "Ecommerce_Product_Images",
        // ✅ Conversion auto WebP + compression automatique
        transformation: [
          { width: 1000, crop: "scale", fetch_format: "auto", quality: "auto" }
        ],
        // ✅ Générer aussi une version thumbnail au moment de l'upload
        eager: [
          { width: 400, crop: "scale", fetch_format: "auto", quality: "auto" },
        ],
        eager_async: true,
      })
    )
  );

  return uploaded.map(r => ({ url: r.secure_url, public_id: r.public_id }));
};

const insertVariantAttributes = async (variantId, attributes) => {
  if (!attributes || attributes.length === 0) return;
  for (const attr of attributes) {
    const { type_fr, value_fr, unit } = attr;
    if (!type_fr || !value_fr)
      throw new ErrorHandler("Chaque attribut doit avoir type_fr et value_fr.", 400);
    const typeId = await AttributeType.upsert(type_fr, unit);
    await ProductVariantAttribute.create({
      variant_id: variantId, attribute_type_id: typeId, value_fr: value_fr.trim(),
    });
  }
};


// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const createProductService = async ({
  name_fr, description_fr, ethical_info_fr, origin,
  usage_fr, ingredients_fr, precautions_fr,
  certifications, supplier_id, category_id,
  slug, variants, userId, files,
  is_active, is_featured, is_new,
}) => {
  const category = await Category.findById(category_id);
  if (!category) throw new ErrorHandler("Catégorie introuvable.", 404);

  if (supplier_id) {
    const supplier = await Supplier.findById(supplier_id);
    if (!supplier) throw new ErrorHandler("Fournisseur introuvable.", 404);
  }

  const finalSlug = slug || name_fr
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + Date.now();

  let uploadedImages = [];
  if (files?.images) uploadedImages = await uploadProductImages(files.images);

  const product = await Product.create({
    name_fr, description_fr,
    ethical_info_fr:  ethical_info_fr  || null,
    origin:           origin           || null,
    certifications:   certifications   ? JSON.stringify(certifications) : null,
    usage_fr:         usage_fr         || null,
    ingredients_fr:   ingredients_fr   || null,
    precautions_fr:   precautions_fr   || null,
    supplier_id:      supplier_id      || null,
    category_id, created_by: userId,
    images:           JSON.stringify(uploadedImages),
    slug:             finalSlug,
    is_active:        is_active        ?? true,
    is_featured:      is_featured      ?? false,
    is_new:           is_new           ?? true,
  });

  const createdVariants = [];
  for (const variant of variants) {
    const { price, cost_price, stock, sku, weight_grams, barcode, low_stock_threshold, attributes } = variant;

    const newVariant = await ProductVariant.create({
      product_id:          product.id,
      sku:                 sku             || null,
      price,
      cost_price:          cost_price      || null,
      stock:               stock           || 0,
      low_stock_threshold: low_stock_threshold || 5,
      weight_grams:        weight_grams    || null,
      barcode:             barcode         || null,
    });

    const parsedAttrs = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
    await insertVariantAttributes(newVariant.id, parsedAttrs);
    createdVariants.push(newVariant);
  }

  await invalidateOffresCache();
  await invalidateDashboardCache();
  return { product, variants: createdVariants };
};


// ═══════════════════════════════════════════════════════════
// FETCH ALL PRODUCTS
// ═══════════════════════════════════════════════════════════
export const fetchAllProductsService = async (params) => {
  return await Product.findAllWithFilters(params);
};


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE PRODUCT
// ═══════════════════════════════════════════════════════════
export const fetchSingleProductService = async (productId, admin = false, alreadyViewed = false) => {
  if (!admin && !alreadyViewed) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    Product.trackView(productId, isUuid ? "id" : "slug"); // fire-and-forget
  }

  const product = await Product.findWithDetails(productId, admin);
  if (!product) throw new ErrorHandler("Produit introuvable.", 404);
  return product;
};


// ═══════════════════════════════════════════════════════════
// FETCH FEATURED PRODUCTS
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedProductsService = async (limit = 8) => {
  return await Product.findFeatured(limit);
};


// ═══════════════════════════════════════════════════════════
// UPDATE PRODUCT
// ═══════════════════════════════════════════════════════════
export const updateProductService = async ({
  productId, name_fr, description_fr,
  ethical_info_fr, origin, certifications,
  usage_fr, ingredients_fr, precautions_fr,
  supplier_id, category_id, slug,
  is_active, is_featured, is_new,
  files, existingImages,
}) => {
  const p = await Product.findById(productId);
  if (!p) throw new ErrorHandler("Produit introuvable.", 404);

  if (category_id) {
    const cat = await Category.findById(category_id);
    if (!cat) throw new ErrorHandler("Catégorie introuvable.", 404);
  }
  if (supplier_id) {
    const sup = await Supplier.findById(supplier_id);
    if (!sup) throw new ErrorHandler("Fournisseur introuvable.", 404);
  }

  let images = existingImages ?? (p.images || []);
  if (files?.images) {
    const newUploads = await uploadProductImages(files.images);
    images = [...images, ...newUploads];
  }

  const updated = await Product.updateFull(productId, {
    name_fr:         name_fr         ?? p.name_fr,
    description_fr:  description_fr  ?? p.description_fr,
    ethical_info_fr: ethical_info_fr ?? p.ethical_info_fr,
    origin:          origin          ?? p.origin,
    certifications:  certifications  ? JSON.stringify(certifications) : p.certifications,
    usage_fr:        usage_fr        ?? p.usage_fr,
    ingredients_fr:  ingredients_fr  ?? p.ingredients_fr,
    precautions_fr:  precautions_fr  ?? p.precautions_fr,
    supplier_id:     supplier_id     ?? p.supplier_id,
    category_id:     category_id     ?? p.category_id,
    slug:            slug            ?? p.slug,
    is_active:       is_active       ?? p.is_active,
    is_featured:     is_featured     ?? p.is_featured,
    images:          JSON.stringify(images),
    is_new:          is_new          ?? p.is_new,
  });

  await invalidateOffresCache();
  return updated;
};


// ═══════════════════════════════════════════════════════════
// ADD VARIANT
// ═══════════════════════════════════════════════════════════
export const addVariantService = async ({
  productId, price, cost_price,
  stock, sku, weight_grams, barcode,
  low_stock_threshold, attributes,
}) => {
  const product = await Product.findById(productId);
  if (!product) throw new ErrorHandler("Produit introuvable.", 404);

  if (!price || price < 0) throw new ErrorHandler("Prix invalide.", 400);

  const variant = await ProductVariant.create({
    product_id:          productId,
    sku:                 sku             || null,
    price,
    cost_price:          cost_price      || null,
    stock:               stock           || 0,
    low_stock_threshold: low_stock_threshold || 5,
    weight_grams:        weight_grams    || null,
    barcode:             barcode         || null,
  });

  const parsedAttrs = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
  await insertVariantAttributes(variant.id, parsedAttrs);

  await invalidateOffresCache();
  return variant;
};


// ═══════════════════════════════════════════════════════════
// UPDATE VARIANT
// ═══════════════════════════════════════════════════════════
export const updateVariantService = async ({
  variantId, price, cost_price,
  stock, sku, low_stock_threshold,
  weight_grams, is_active, attributes,
}) => {
  const v = await ProductVariant.findById(variantId);
  if (!v) throw new ErrorHandler("Variant introuvable.", 404);

  const safeNum = (val) => {
    if (val === "" || val === null || val === undefined) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const newPrice       = safeNum(price)        ?? v.price;
  const newCostPrice   = safeNum(cost_price)   ?? v.cost_price;
  const newStock       = safeNum(stock)        ?? v.stock;
  const newWeightGrams = safeNum(weight_grams) ?? v.weight_grams;

  if (newStock < 0) throw new ErrorHandler("Le stock ne peut pas être négatif.", 400);

  const updated = await ProductVariant.updateFull(variantId, {
    price:               newPrice,
    cost_price:          newCostPrice,
    stock:               newStock,
    sku:                 sku                 ?? v.sku,
    low_stock_threshold: low_stock_threshold ?? v.low_stock_threshold,
    weight_grams:        newWeightGrams,
    is_active:           is_active           ?? v.is_active,
  });

  if (attributes && attributes.length > 0) {
    await ProductVariantAttribute.deleteByVariantId(variantId);
    const parsedAttrs = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
    await insertVariantAttributes(variantId, parsedAttrs);
  }

  await invalidateOffresCache();
  return updated;
};


// ═══════════════════════════════════════════════════════════
// DELETE VARIANT
// ═══════════════════════════════════════════════════════════
export const deleteVariantService = async (variantId) => {
  const variant = await ProductVariant.findById(variantId);
  if (!variant) throw new ErrorHandler("Variant introuvable.", 404);

  await ProductVariant.delete(variantId);
  await invalidateOffresCache();
};


// ═══════════════════════════════════════════════════════════
// DELETE PRODUCT
// ═══════════════════════════════════════════════════════════
export const deleteProductService = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) throw new ErrorHandler("Produit introuvable.", 404);

  await Promise.all(
    (product.images || [])
      .filter(img => img.public_id)
      .map(img => cloudinary.uploader.destroy(img.public_id))
  );

  await Product.delete(productId);
  await invalidateOffresCache();
  await invalidateDashboardCache();
};