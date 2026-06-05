// controllers/aiController.js
import catchAsyncErrors from '../middlewares/catchAsyncErrors.js';
import { recommanderProduits } from '../services/aiService.js';

// ─────────────────────────────────────────────────────────────
// POST /api/ai/recommander
// Validation HTTP uniquement — toute la logique est dans aiService
// ─────────────────────────────────────────────────────────────
export const recommander = catchAsyncErrors(async (req, res) => {
  const { demande } = req.body;

  if (!demande || typeof demande !== 'string' || demande.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'La demande est trop courte (minimum 2 caractères).',
    });
  }

  if (demande.trim().length > 500) {
    return res.status(400).json({
      success: false,
      message: 'La demande est trop longue (maximum 500 caractères).',
    });
  }

  const resultat = await recommanderProduits(demande.trim());

  res.status(200).json({
    success: true,
    ...resultat,
  });
});