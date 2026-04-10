import {
  createReclamationService,
  getAllReclamationsService,
  updateStatusService,
} from "../services/contactService.js";

// ═══════════════════════════════════════════════════════════
// POST /api/contact/reclamation  (public)
// ═══════════════════════════════════════════════════════════
export const createReclamation = async (req, res, next) => {
  try {
    const reclamation = await createReclamationService(req.body);
    res.status(201).json({ message: "Réclamation enregistrée.", reclamation });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════
// GET /api/contact/reclamations  (admin)
// ═══════════════════════════════════════════════════════════
export const getAllReclamations = async (req, res, next) => {
  try {
    const reclamations = await getAllReclamationsService();
    res.status(200).json({ reclamations });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════
// PATCH /api/contact/reclamations/:id/status  (admin)
// ═══════════════════════════════════════════════════════════
export const updateStatus = async (req, res, next) => {
  try {
    const reclamation = await updateStatusService(req.params.id, req.body.status);
    res.status(200).json({ reclamation });
  } catch (err) {
    next(err);
  }
};