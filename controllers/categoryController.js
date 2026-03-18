import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as categoryService from "../services/categoryService.js";

// ═══════════════════════════════════════════════════════════
// CREATE CATEGORY
// POST /api/categories  (admin only)
// Body: { name_fr, name_ar?, description_fr?, description_ar?, parent_id? }
// Files: images
// ═══════════════════════════════════════════════════════════
export const createCategory = catchAsyncErrors(async (req, res, next) => {
  const { name_fr, name_ar, description_fr, description_ar, parent_id } = req.body;

  if (!name_fr)
    return next(new ErrorHandler("name_fr est obligatoire.", 400));

  const category = await categoryService.createCategoryService({
    name_fr, name_ar, description_fr, description_ar,
    parent_id: parent_id || null,
    files: req.files,
  });

  res.status(201).json({
    success: true,
    message: "Catégorie créée avec succès.",
    category,
  });
});

// ═══════════════════════════════════════════════════════════
// FETCH ALL CATEGORIES (public)
// GET /api/categories
// ═══════════════════════════════════════════════════════════
export const fetchAllCategories = catchAsyncErrors(async (req, res) => {
  const { categories, total } = await categoryService.fetchAllCategoriesService();

  res.status(200).json({
    success:         true,
    totalCategories: total,
    categories,
  });
});

// ═══════════════════════════════════════════════════════════
// FETCH SINGLE CATEGORY (public)
// GET /api/categories/:categoryId
// ═══════════════════════════════════════════════════════════
export const fetchSingleCategory = catchAsyncErrors(async (req, res) => {
  const category = await categoryService.fetchSingleCategoryService(req.params.categoryId);
  res.status(200).json({ success: true, category });
});

// ═══════════════════════════════════════════════════════════
// UPDATE CATEGORY (admin only)
// PUT /api/categories/:categoryId
// ═══════════════════════════════════════════════════════════
export const updateCategory = catchAsyncErrors(async (req, res) => {
  const { name_fr, name_ar, description_fr, description_ar, parent_id, is_active, sort_order } = req.body;

  const category = await categoryService.updateCategoryService({
    categoryId: req.params.categoryId,
    name_fr, name_ar, description_fr, description_ar,
    parent_id, is_active, sort_order,
    files: req.files,
  });

  res.status(200).json({ success: true, message: "Catégorie mise à jour.", category });
});

// ═══════════════════════════════════════════════════════════
// DELETE CATEGORY (admin only)
// DELETE /api/categories/:categoryId
// ═══════════════════════════════════════════════════════════
export const deleteCategory = catchAsyncErrors(async (req, res) => {
  await categoryService.deleteCategoryService(req.params.categoryId);
  res.status(200).json({ success: true, message: "Catégorie supprimée." });
});