import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as productService from "../services/productService.js";

// ═══════════════════════════════════════════════════════════
// HELPER — convertit une chaîne vide en undefined
// ✅ FIX: "" ?? fallback  →  retourne ""  (mauvais)
//         toUndefinedIfEmpty("") ?? fallback  →  retourne fallback  (correct)
// ═══════════════════════════════════════════════════════════
const ou = (val) => (val === "" || val === null ? undefined : val);

// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// POST /api/products  (admin only)
// ═══════════════════════════════════════════════════════════
export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const {
    name_fr,
    description_fr,
    ethical_info_fr,
    origin,
    usage_fr,
    ingredients_fr,
    precautions_fr,
    supplier_id,
    category_id,
    slug,
    variants,
    certifications,
  } = req.body;

  // ✅ Validation uniquement à la création
  if (!name_fr || !description_fr || !category_id)
    return next(new ErrorHandler("name_fr, description_fr and category_id are required.", 400));

  const parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
  if (!parsedVariants || parsedVariants.length === 0)
    return next(new ErrorHandler("At least one variant with price is required.", 400));

  const { product, variants: createdVariants } = await productService.createProductService({
    name_fr,
    description_fr,
    ethical_info_fr,
    origin,
    usage_fr,
    ingredients_fr,
    precautions_fr,
    certifications: certifications ? JSON.parse(certifications) : null,
    supplier_id: supplier_id || null,
    category_id,
    slug,
    variants: parsedVariants,
    userId: req.user.id,
    files: req.files,
existingImages: req.body.existingImages ? JSON.parse(req.body.existingImages) : undefined,    is_active:   req.body.is_active   !== undefined ? req.body.is_active   === "true" : true,
    is_featured: req.body.is_featured !== undefined ? req.body.is_featured === "true" : false,
    is_new:      req.body.is_new      !== undefined ? req.body.is_new      === "true" : true,
  });

  res.status(201).json({
    success: true,
    message: "Product created successfully.",
    product,
    variants: createdVariants,
  });
});

// ═══════════════════════════════════════════════════════════
// FETCH ALL PRODUCTS
// GET /api/products
// ═══════════════════════════════════════════════════════════
export const fetchAllProducts = catchAsyncErrors(async (req, res) => {
  const {
    search, category_id, min_rating, min_price, max_price,
    is_featured, supplier_id, admin, is_active,
  } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await productService.fetchAllProductsService({
    search,
    category_id,
    min_rating,
    min_price,
    max_price,
    is_featured: is_featured === "true",
    supplier_id,
    page,
    admin,
    // filtre statut explicite (admin uniquement)
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// FETCH FEATURED PRODUCTS
// GET /api/products/featured
// ═══════════════════════════════════════════════════════════
export const fetchFeaturedProducts = catchAsyncErrors(async (req, res) => {
  const limit = parseInt(req.query.limit) || 8;
  const products = await productService.fetchFeaturedProductsService(limit);
  res.status(200).json({ success: true, products });
});

// ═══════════════════════════════════════════════════════════
// FETCH SINGLE PRODUCT
// GET /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const fetchSingleProduct = catchAsyncErrors(async (req, res) => {
const admin = req.query.admin === "true" && req.user?.role === "admin"; 
                 const viewKey = `viewed_${req.params.productId}`;
  const alreadyViewed = req.cookies?.[viewKey] === "1";

  const product = await productService.fetchSingleProductService(
    req.params.productId,
    admin,
    alreadyViewed
  );

  if (!admin && !alreadyViewed) {
    res.cookie(viewKey, "1", {
      maxAge: 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  res.status(200).json({ success: true, product });
});

// ═══════════════════════════════════════════════════════════
// UPDATE PRODUCT
// PUT /api/products/:productId
// ✅ FIX: les champs vides ("") sont convertis en undefined
//         → le service garde alors la valeur existante en base
//         → aucun champ n'est obligatoire pour un UPDATE
// ═══════════════════════════════════════════════════════════
export const updateProduct = catchAsyncErrors(async (req, res) => {
    
  const {
    name_fr,
    description_fr,
    ethical_info_fr,
    origin,
    usage_fr,
    ingredients_fr,
    precautions_fr,
    supplier_id,
    category_id,
    slug,
    is_active,
    is_featured,
    is_new,
    certifications,
    existingImages, 
  } = req.body;

  const product = await productService.updateProductService({
    productId:      req.params.productId,
    name_fr:        ou(name_fr),
    description_fr: ou(description_fr),      
    ethical_info_fr:ou(ethical_info_fr),
    origin:         ou(origin),
    usage_fr:       ou(usage_fr),
    ingredients_fr: ou(ingredients_fr),
    precautions_fr: ou(precautions_fr),
    certifications: certifications ? JSON.parse(certifications) : undefined,
    supplier_id:    ou(supplier_id),
    category_id:    ou(category_id),
    slug:           ou(slug),
    is_active:      is_active   !== undefined ? is_active   === "true" : undefined,
    is_featured:    is_featured !== undefined ? is_featured === "true" : undefined,
    is_new:         is_new      !== undefined ? is_new      === "true" : undefined,
    files:          req.files,
    existingImages: existingImages ? JSON.parse(existingImages) : undefined,
  });

  res.status(200).json({
    success: true,
    message: "Product updated successfully.",
    product,
  });
});

// ═══════════════════════════════════════════════════════════
// DELETE PRODUCT
// ═══════════════════════════════════════════════════════════
export const deleteProduct = catchAsyncErrors(async (req, res) => {
  await productService.deleteProductService(req.params.productId);
  res.status(200).json({ success: true, message: "Product deleted successfully." });
});

// ═══════════════════════════════════════════════════════════
// ADD VARIANT
// ═══════════════════════════════════════════════════════════
export const addVariant = catchAsyncErrors(async (req, res, next) => {
  const {
    price, cost_price, stock, sku, weight_grams, barcode,
    low_stock_threshold, attributes,              // ✅ low_stock_threshold ajouté
  } = req.body;

  if (!price) return next(new ErrorHandler("Price is required.", 400));

  const variant = await productService.addVariantService({
    productId: req.params.productId,
    price, cost_price, stock, sku, weight_grams, barcode,
    low_stock_threshold,
    attributes: typeof attributes === "string" ? JSON.parse(attributes) : attributes,
  });

  res.status(201).json({ success: true, message: "Variant added successfully.", variant });
});

// ═══════════════════════════════════════════════════════════
// UPDATE VARIANT
// ✅ FIX: low_stock_threshold ajouté + champs vides convertis
// ═══════════════════════════════════════════════════════════
export const updateVariant = catchAsyncErrors(async (req, res) => {
  const {
    price, cost_price, stock, sku, weight_grams,
    is_active, low_stock_threshold, attributes             
  } = req.body;

  const variant = await productService.updateVariantService({
    variantId: req.params.variantId,
    price, cost_price, stock, sku, weight_grams,
    low_stock_threshold,
    attributes: attributes ? JSON.parse(attributes) : undefined, 
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.status(200).json({ success: true, message: "Variant updated successfully.", variant });
});

// ═══════════════════════════════════════════════════════════
// DELETE VARIANT
// ═══════════════════════════════════════════════════════════
export const deleteVariant = catchAsyncErrors(async (req, res) => {
  await productService.deleteVariantService(req.params.variantId);
  res.status(200).json({ success: true, message: "Variant deleted successfully." });
});