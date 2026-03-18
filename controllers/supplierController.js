import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as supplierService from "../services/supplierService.js";

export const createSupplier = catchAsyncErrors(async (req, res, next) => {
  const {
    name, name_ar, description_fr, description_ar,
    region, address, contact, email, website, is_certified_bio,
  } = req.body;

  if (!name)
    return next(new ErrorHandler("Le nom du fournisseur est obligatoire.", 400));

  const supplier = await supplierService.createSupplierService({
    name, name_ar, description_fr, description_ar,
    region, address, contact, email, website,
    is_certified_bio, files: req.files,
  });

  res.status(201).json({ success: true, message: "Fournisseur créé.", supplier });
});

export const fetchAllSuppliers = catchAsyncErrors(async (req, res) => {
  const suppliers = await supplierService.fetchAllSuppliersService();
  res.status(200).json({ success: true, totalSuppliers: suppliers.length, suppliers });
});

export const fetchSupplierBySlug = catchAsyncErrors(async (req, res) => {
  console.log("[controller] slug:", req.params.slug);
  const supplier = await supplierService.fetchSupplierBySlugService(req.params.slug);
  res.status(200).json({ success: true, supplier });
});

export const updateSupplier = catchAsyncErrors(async (req, res) => {
  const {
    name, name_ar, description_fr, description_ar,
    region, address, contact, email, website,
    is_certified_bio, is_active,
  } = req.body;

  const supplier = await supplierService.updateSupplierService({
    supplierId: req.params.supplierId,
    name, name_ar, description_fr, description_ar,
    region, address, contact, email, website,
    is_certified_bio, is_active, files: req.files,
  });

  res.status(200).json({ success: true, message: "Fournisseur mis à jour.", supplier });
});

export const deleteSupplier = catchAsyncErrors(async (req, res) => {
  await supplierService.deleteSupplierService(req.params.supplierId);
  res.status(200).json({ success: true, message: "Fournisseur supprimé." });
});