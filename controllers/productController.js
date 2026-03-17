import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as productService from "../services/productService.js";

// ═══════════════════════════════════════════════════════════
// CREATE PRODUCT
// POST /api/products (admin only)
// ═══════════════════════════════════════════════════════════
export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const { name, description, ethical_info, supplier_name, category_id, variants } = req.body;

  if (!name || !description || !category_id)
    return next(new ErrorHandler("Please provide name, description and category.", 400));

  const parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
  if (!parsedVariants || parsedVariants.length === 0)
    return next(new ErrorHandler("Please provide at least one variant with price and stock.", 400));

  const { product, variants: createdVariants } = await productService.createProductService({
    name, description, ethical_info, supplier_name, category_id,
    variants: parsedVariants,
    userId:   req.user.id,
    files:    req.files,
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
// ═══════════════════════════════════════════════════════════
export const fetchAllProducts = catchAsyncErrors(async (req, res, next) => {
  const { search, category_id, ratings, min_price, max_price } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await productService.fetchAllProductsService({
    search, category_id, ratings, min_price, max_price, page,
  });

  res.status(200).json({ success: true, ...data });
});


// ═══════════════════════════════════════════════════════════
// FETCH SINGLE PRODUCT (public)
// GET /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const fetchSingleProduct = catchAsyncErrors(async (req, res, next) => {
  const product = await productService.fetchSingleProductService(req.params.productId);
  res.status(200).json({ success: true, product });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PRODUCT (admin only)
// PUT /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const updateProduct = catchAsyncErrors(async (req, res, next) => {
  const { name, description, ethical_info, supplier_name, category_id } = req.body;

  const product = await productService.updateProductService({
    productId: req.params.productId,
    name, description, ethical_info, supplier_name, category_id,
    files: req.files,
  });

  res.status(200).json({ success: true, message: "Product updated successfully.", product });
});


// ═══════════════════════════════════════════════════════════
// ADD VARIANT (admin only)
// POST /api/products/:productId/variants
// ═══════════════════════════════════════════════════════════
export const addVariant = catchAsyncErrors(async (req, res, next) => {
  const { price, stock, attributes } = req.body;

  const variant = await productService.addVariantService({
    productId: req.params.productId,
    price, stock, attributes,
  });

  res.status(201).json({ success: true, message: "Variant added successfully.", variant });
});


// ═══════════════════════════════════════════════════════════
// UPDATE VARIANT (admin only)
// PUT /api/products/:productId/variants/:variantId
// ═══════════════════════════════════════════════════════════
export const updateVariant = catchAsyncErrors(async (req, res, next) => {
  const { price, stock } = req.body;

  const variant = await productService.updateVariantService({
    variantId: req.params.variantId,
    price, stock,
  });

  res.status(200).json({ success: true, message: "Variant updated successfully.", variant });
});


// ═══════════════════════════════════════════════════════════
// DELETE VARIANT (admin only)
// DELETE /api/products/:productId/variants/:variantId
// ═══════════════════════════════════════════════════════════
export const deleteVariant = catchAsyncErrors(async (req, res, next) => {
  await productService.deleteVariantService(req.params.variantId);
  res.status(200).json({ success: true, message: "Variant deleted successfully." });
});


// ═══════════════════════════════════════════════════════════
// DELETE PRODUCT (admin only)
// DELETE /api/products/:productId
// ═══════════════════════════════════════════════════════════
export const deleteProduct = catchAsyncErrors(async (req, res, next) => {
  await productService.deleteProductService(req.params.productId);
  res.status(200).json({ success: true, message: "Product and all its variants deleted successfully." });
});

