import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as productService from "../services/productService.js";

// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// POST /api/products  (admin only)
// Body: { name_fr, name_ar, description_fr, description_ar,
//         ethical_info_fr, origin, certifications,
//         supplier_id, category_id, variants: JSON string }
// Files: images
// ═══════════════════════════════════════════════════════════
export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const {
    name_fr, name_ar, description_fr, description_ar,
    ethical_info_fr, ethical_info_ar, origin, certifications,
    supplier_id, category_id, slug, variants,
  } = req.body;

  if (!name_fr || !description_fr || !category_id)
    return next(new ErrorHandler("name_fr, description_fr and category_id are required.", 400));

  const parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
  if (!parsedVariants || parsedVariants.length === 0)
    return next(new ErrorHandler("At least one variant with price is required.", 400));

  const { product, variants: createdVariants } = await productService.createProductService({
    name_fr, name_ar, description_fr, description_ar,
    ethical_info_fr, ethical_info_ar, origin,
    certifications: certifications ? JSON.parse(certifications) : null,
    supplier_id: supplier_id || null,
    category_id, slug,
    variants: parsedVariants,
    userId: req.user.id,
    files:  req.files,
  });

  res.status(201).json({
    success:  true,
    message:  "Product created successfully.",
    product,
    variants: createdVariants,
  });
});

// ═══════════════════════════════════════════════════════════
// FETCH ALL PRODUCTS (public)
// GET /api/products
// Query: search, category_id, min_rating, min_price, max_price,
//        page, is_featured, supplier_id
// ═══════════════════════════════════════════════════════════
export const fetchAllProducts = catchAsyncErrors(async (req, res) => {
  const {
    search, category_id, min_rating, min_price, max_price,
    is_featured, supplier_id,
  } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await productService.fetchAllProductsService({
    search, category_id, min_rating, min_price, max_price,
    is_featured: is_featured === "true",
    supplier_id, page,
  });

  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// FETCH FEATURED PRODUCTS (public)
// GET /api/products/featured
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedProducts = catchAsyncErrors(async (req, res) => {
  const limit    = parseInt(req.query.limit) || 8;
  const products = await productService.fetchFeaturedProductsService(limit);
  res.status(200).json({ success: true, products });
});

// ═══════════════════════════════════════════════════════════
// FETCH SINGLE PRODUCT (public)
// GET /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const fetchSingleProduct = catchAsyncErrors(async (req, res) => {
  const product = await productService.fetchSingleProductService(req.params.productId);
  res.status(200).json({ success: true, product });
});

// ═══════════════════════════════════════════════════════════
// UPDATE PRODUCT (admin only)
// PUT /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const updateProduct = catchAsyncErrors(async (req, res) => {
  const {
    name_fr, name_ar, description_fr, description_ar,
    ethical_info_fr, ethical_info_ar, origin, certifications,
    supplier_id, category_id, slug, is_active, is_featured,
  } = req.body;

  const product = await productService.updateProductService({
    productId: req.params.productId,
    name_fr, name_ar, description_fr, description_ar,
    ethical_info_fr, ethical_info_ar, origin,
    certifications: certifications ? JSON.parse(certifications) : undefined,
    supplier_id, category_id, slug,
    is_active:  is_active  !== undefined ? is_active  === "true" : undefined,
    is_featured: is_featured !== undefined ? is_featured === "true" : undefined,
    files: req.files,
  });

  res.status(200).json({ success: true, message: "Product updated successfully.", product });
});

// ═══════════════════════════════════════════════════════════
// DELETE PRODUCT (admin only)
// DELETE /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const deleteProduct = catchAsyncErrors(async (req, res) => {
  await productService.deleteProductService(req.params.productId);
  res.status(200).json({ success: true, message: "Product deleted successfully." });
});

// ═══════════════════════════════════════════════════════════
// ADD VARIANT (admin only)
// POST /api/products/:productId/variants
// Body: { price, compare_price, cost_price, stock, sku,
//         weight_grams, barcode, attributes: JSON string }
// ═══════════════════════════════════════════════════════════
export const addVariant = catchAsyncErrors(async (req, res, next) => {
  const {
    price, compare_price, cost_price,
    stock, sku, weight_grams, barcode, attributes,
  } = req.body;

  if (!price) return next(new ErrorHandler("Price is required.", 400));

  const variant = await productService.addVariantService({
    productId: req.params.productId,
    price, compare_price, cost_price,
    stock, sku, weight_grams, barcode,
    attributes: typeof attributes === "string" ? JSON.parse(attributes) : attributes,
  });

  res.status(201).json({ success: true, message: "Variant added successfully.", variant });
});

// ═══════════════════════════════════════════════════════════
// UPDATE VARIANT (admin only)
// PUT /api/products/:productId/variants/:variantId
// ═══════════════════════════════════════════════════════════
export const updateVariant = catchAsyncErrors(async (req, res) => {
  const { price, compare_price, cost_price, stock, sku, weight_grams, is_active } = req.body;

  const variant = await productService.updateVariantService({
    variantId: req.params.variantId,
    price, compare_price, cost_price, stock, sku, weight_grams,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.status(200).json({ success: true, message: "Variant updated successfully.", variant });
});

// ═══════════════════════════════════════════════════════════
// DELETE VARIANT (admin only)
// DELETE /api/products/:productId/variants/:variantId
// ═══════════════════════════════════════════════════════════
export const deleteVariant = catchAsyncErrors(async (req, res) => {
  await productService.deleteVariantService(req.params.variantId);
  res.status(200).json({ success: true, message: "Variant deleted successfully." });
});