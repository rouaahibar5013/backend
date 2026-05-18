import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import {
  createReclamationService,
  createGuestReclamationService,
  getAllReclamationsService,
  getSingleReclamationService,
  respondToReclamationService,
  getEligibleOrdersService,
  getReclamationStatsService,
  getMyReclamationsService,
} from "../services/reclamationService.js";

// ═══════════════════════════════════════════════════════════
// GET /api/reclamations/eligible-orders (user connecté)
// ✅ Commandes éligibles pour le formulaire de réclamation
// ═══════════════════════════════════════════════════════════
export const getEligibleOrders = catchAsyncErrors(async (req, res, next) => {
  const orders = await getEligibleOrdersService(req.user.id);
  res.status(200).json({ success: true, orders });
});

// ═══════════════════════════════════════════════════════════
// POST /api/reclamations (user connecté)
// ✅ Crée la réclamation + envoie email de confirmation au client
// ═══════════════════════════════════════════════════════════
export const createReclamation = catchAsyncErrors(async (req, res, next) => {
  const { order_id, complaint_type, message } = req.body;

  if (!complaint_type || !message)
    return next(new ErrorHandler("Type et message sont obligatoires.", 400));

  const reclamation = await createReclamationService({
    userId: req.user.id,
    order_id,
    complaint_type,
    message,
  });

  res.status(201).json({
    success:   true,
    message:   "Réclamation enregistrée. Vous recevrez une réponse par email.",
    reclamation,
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/reclamations (admin)
// ✅ Toutes les réclamations avec filtres + pagination
// ═══════════════════════════════════════════════════════════
export const getAllReclamations = catchAsyncErrors(async (req, res, next) => {
  const { status, type } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await getAllReclamationsService({ status, type, page });
  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// GET /api/reclamations/:id (admin)
// ✅ Détail complet d'une réclamation
// ═══════════════════════════════════════════════════════════
export const getSingleReclamation = catchAsyncErrors(async (req, res, next) => {
  const reclamation = await getSingleReclamationService(req.params.id);
  res.status(200).json({ success: true, reclamation });
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/reclamations/:id/respond (admin)
// ✅ Répondre + changer statut + délai
// ✅ Email automatique au client
// ═══════════════════════════════════════════════════════════
export const respondToReclamation = catchAsyncErrors(async (req, res, next) => {
  const { status, admin_response, resolution_delay, avec_remboursement } = req.body;

  if (!status || !admin_response)
    return next(new ErrorHandler("Statut et réponse sont obligatoires.", 400));

  const reclamation = await respondToReclamationService({
    reclamationId:   req.params.id,
    adminId:         req.user.id,
    status,
    admin_response,
    resolution_delay: resolution_delay ? parseInt(resolution_delay) : null,
    avec_remboursement,
  });

  res.status(200).json({
    success:     true,
    message:     "Réponse envoyée. Le client a été notifié par email.",
    reclamation,
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/reclamations/stats (admin dashboard)
// ═══════════════════════════════════════════════════════════
export const getReclamationStats = catchAsyncErrors(async (req, res, next) => {
  const stats = await getReclamationStatsService();
  res.status(200).json({ success: true, stats });
});


// POST /api/reclamations/guest  (public — pas de isAuthenticated)
export const createGuestReclamation = catchAsyncErrors(async (req, res, next) => {
  const { email, order_number, complaint_type, message } = req.body;

  if (!email || !order_number || !complaint_type || !message)
    return next(new ErrorHandler(
      "Email, numéro de commande, type et message sont obligatoires.", 400
    ));

  const reclamation = await createGuestReclamationService({
    email, order_number, complaint_type, message,
  });

  res.status(201).json({
    success:    true,
    message:    "Réclamation enregistrée. Vous recevrez une réponse par email.",
    reclamation,
  });
});

// ═══════════════════════════════════════════════════════════
// — GET MES RÉCLAMATIONS (user connecté)
// ═══════════════════════════════════════════════════════════
export const getMyReclamations = catchAsyncErrors(async (req, res, next) => {
  const reclamations = await getMyReclamationsService(req.user.id);
  res.status(200).json({ reclamations });
});