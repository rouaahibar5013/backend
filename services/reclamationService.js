import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

const VALID_STATUSES = ["en_attente", "en_cours", "resolue"];

// ═══════════════════════════════════════════════════════════
// PUBLIC — SOUMETTRE UNE RÉCLAMATION
// ═══════════════════════════════════════════════════════════
export const createReclamationService = async ({
  user_name, user_email, user_phone, order_number, reclamation_type, message,
}) => {
  if (!user_name || !user_email || !reclamation_type || !message)
    throw new ErrorHandler("Champs obligatoires manquants.", 400);

  if (message.trim().length < 10)
    throw new ErrorHandler("Le message doit contenir au moins 10 caractères.", 400);

  const result = await database.query(
    `INSERT INTO reclamations
       (user_name, user_email, user_phone, order_number, reclamation_type, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      user_name.trim(),
      user_email.trim(),
      user_phone   || null,
      order_number || null,
      reclamation_type,
      message.trim(),
    ]
  );
  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// ADMIN — GET ALL RÉCLAMATIONS
// ═══════════════════════════════════════════════════════════
export const getAllReclamationsService = async () => {
  const result = await database.query(
    "SELECT * FROM reclamations ORDER BY created_at DESC"
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// ADMIN — UPDATE STATUS
// ═══════════════════════════════════════════════════════════
export const updateStatusService = async (id, status) => {
  if (!VALID_STATUSES.includes(status))
    throw new ErrorHandler("Statut invalide.", 400);

  const existing = await database.query(
    "SELECT id FROM reclamations WHERE id=$1", [id]
  );
  if (existing.rows.length === 0)
    throw new ErrorHandler("Réclamation introuvable.", 404);

  const result = await database.query(
    "UPDATE reclamations SET status=$1 WHERE id=$2 RETURNING *",
    [status, id]
  );
  return result.rows[0];
};