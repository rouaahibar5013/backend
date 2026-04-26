import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail    from "../utils/sendEmail.js";

const VALID_STATUSES = ["en_attente", "en_cours", "resolue", "rejetee"];

const VALID_TYPES = [
  "produit_defectueux",
  "commande_non_recue",
  "produit_incorrect",
  "retard_livraison",
  "remboursement",
  "autre",
];

const TYPE_LABELS = {
  produit_defectueux: "Produit défectueux",
  commande_non_recue: "Commande non reçue",
  produit_incorrect:  "Produit incorrect",
  retard_livraison:   "Retard de livraison",
  remboursement:      "Demande de remboursement",
  autre:              "Autre",
};

const STATUS_LABELS = {
  en_attente: "En attente",
  en_cours:   "En cours de traitement",
  resolue:    "Résolue",
  rejetee:    "Rejetée",
};

// ═══════════════════════════════════════════════════════════
// HELPER — Email confirmation réclamation au client
// ═══════════════════════════════════════════════════════════
const sendReclamationConfirmationEmail = async (toEmail, userName, reclamation, orderNumber) => {
  await sendEmail({
    to:      toEmail,
    subject: `📋 Réclamation #${reclamation.id.slice(0, 8).toUpperCase()} reçue — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #166534;">📋 Réclamation reçue</h2>
          <p>Bonjour ${userName},</p>
          <p>Nous avons bien reçu votre réclamation. Notre équipe va l'examiner dans les meilleurs délais.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
            <p><strong>Référence :</strong> #${reclamation.id.slice(0, 8).toUpperCase()}</p>
            ${orderNumber ? `<p><strong>Commande concernée :</strong> #${orderNumber}</p>` : ""}
            <p><strong>Type :</strong> ${TYPE_LABELS[reclamation.reclamation_type] || reclamation.reclamation_type}</p>
            <p><strong>Statut :</strong> En attente de traitement</p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">
            Vous recevrez un email dès qu'un membre de notre équipe aura traité votre demande.
          </p>
        </div>
      </div>
    `,
  }).catch(err => console.error("Reclamation confirmation email error:", err.message));
};

// ═══════════════════════════════════════════════════════════
// HELPER — Email réponse admin au client
// ═══════════════════════════════════════════════════════════
const sendAdminResponseEmail = async (toEmail, userName, reclamation, orderNumber) => {
  const statusColor =
    reclamation.status === "resolue" ? "#166534" :
    reclamation.status === "rejetee" ? "#dc2626" : "#f59e0b";

  await sendEmail({
    to:      toEmail,
    subject: `🔔 Réponse à votre réclamation #${reclamation.id.slice(0, 8).toUpperCase()} — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: ${statusColor};">
            ${reclamation.status === "resolue" ? "✅ Réclamation résolue"  :
              reclamation.status === "rejetee" ? "❌ Réclamation rejetée"  :
              "🔔 Mise à jour de votre réclamation"}
          </h2>
          <p>Bonjour ${userName},</p>
          <p>Notre équipe a traité votre réclamation :</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColor};">
            <p><strong>Référence :</strong> #${reclamation.id.slice(0, 8).toUpperCase()}</p>
            ${orderNumber ? `<p><strong>Commande :</strong> #${orderNumber}</p>` : ""}
            <p><strong>Statut :</strong>
              <span style="color: ${statusColor}; font-weight: bold;">
                ${STATUS_LABELS[reclamation.status]}
              </span>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p><strong>Réponse de notre équipe :</strong></p>
            <p style="color: #374151; line-height: 1.6;">${reclamation.admin_response}</p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">
            Pour toute question supplémentaire, contactez-nous à contact@goffa.tn
          </p>
        </div>
      </div>
    `,
  }).catch(err => console.error("Admin response email error:", err.message));
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET COMMANDES ÉLIGIBLES
// ✅ Affiché dans le formulaire pour que le user choisisse sa commande
// ✅ Seulement les commandes payées et actives
// ═══════════════════════════════════════════════════════════
export const getEligibleOrdersService = async (userId) => {
  const result = await database.query(
    `SELECT
       o.id,
       o.order_number,
       o.status,
       o.total_price,
       o.created_at,
       COUNT(oi.id) AS item_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id        = $1
       AND o.payment_status = 'paye'
    AND o.status IN ('confirmee', 'en_preparation', 'expediee', 'livree')
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// SERVICE — CRÉER UNE RÉCLAMATION (user authentifié)
// ✅ Vérifie que la commande appartient au user
// ✅ Vérifie qu'il n'y a pas déjà une réclamation active du même type
// ✅ Envoie email de confirmation au client
// ✅ Zéro redondance : user_name/email/phone via user_id FK
// ═══════════════════════════════════════════════════════════
export const createReclamationService = async ({
  userId, order_id, reclamation_type, message,
}) => {
  if (!VALID_TYPES.includes(reclamation_type))
    throw new ErrorHandler(`Type invalide. Valeurs acceptées : ${VALID_TYPES.join(", ")}`, 400);

  if (!message || message.trim().length < 10)
    throw new ErrorHandler("Le message doit contenir au moins 10 caractères.", 400);

  // Récupérer les infos user via FK (pas de redondance)
  const userResult = await database.query(
    "SELECT id, name, email, phone FROM users WHERE id = $1",
    [userId]
  );
  if (userResult.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  const user = userResult.rows[0];

  // Si order_id fourni → vérifier appartenance
  let order = null;
  if (order_id) {
    const orderResult = await database.query(
      `SELECT id, order_number, status
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [order_id, userId]
    );

    if (orderResult.rows.length === 0)
      throw new ErrorHandler(
        "Commande introuvable ou vous n'êtes pas autorisé à réclamer sur cette commande.",
        403
      );

    order = orderResult.rows[0];

    // Vérifier qu'il n'y a pas déjà une réclamation active du même type
    const existing = await database.query(
      `SELECT id FROM reclamations
       WHERE order_id         = $1
         AND user_id          = $2
         AND reclamation_type = $3
         AND status NOT IN ('resolue', 'rejetee')`,
      [order_id, userId, reclamation_type]
    );

    if (existing.rows.length > 0)
      throw new ErrorHandler(
        "Vous avez déjà une réclamation active de ce type pour cette commande.",
        409
      );
  }

  // Insérer — seulement user_id + order_id comme FK
  const result = await database.query(
    `INSERT INTO reclamations (user_id, order_id, reclamation_type, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, order_id || null, reclamation_type, message.trim()]
  );

  const reclamation = result.rows[0];

  // Email de confirmation au client
  await sendReclamationConfirmationEmail(
    user.email,
    user.name,
    reclamation,
    order?.order_number || null
  );

  return {
    ...reclamation,
    // Enrichi pour la réponse JSON uniquement (non stocké en DB)
    user_name:    user.name,
    order_number: order?.order_number || null,
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET TOUTES LES RÉCLAMATIONS (admin)
// ✅ JOIN vers users + orders — zéro redondance
// ✅ Filtres : status, type, page
// ✅ Triées : en_attente en premier
// ═══════════════════════════════════════════════════════════
export const getAllReclamationsService = async ({ status, type, page = 1 }) => {
  const limit  = 15;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   i          = 1;

  if (status) { conditions.push(`r.status = $${i}`);           values.push(status); i++; }
  if (type)   { conditions.push(`r.reclamation_type = $${i}`); values.push(type);   i++; }

  const where       = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);

  const [totalResult, result] = await Promise.all([
    database.query(`SELECT COUNT(*) FROM reclamations r ${where}`, countValues),
    database.query(
      `SELECT
         r.id, r.reclamation_type, r.message, r.status,
         r.admin_response, r.responded_at,
         r.resolution_delay, r.deadline_at,
         r.created_at, r.updated_at,
         -- Infos user via JOIN
         u.id    AS user_id,
         u.name  AS user_name,
         u.email AS user_email,
         u.phone AS user_phone,
         -- Infos commande via JOIN
         o.id           AS order_id,
         o.order_number,
         o.status       AS order_status,
         o.total_price  AS order_total,
         o.created_at   AS order_date,
         -- Admin qui a répondu
         a.name         AS admin_name
       FROM reclamations r
       LEFT JOIN users  u ON u.id = r.user_id
       LEFT JOIN orders o ON o.id = r.order_id
       LEFT JOIN users  a ON a.id = r.admin_id
       ${where}
       ORDER BY
         CASE r.status
           WHEN 'en_attente' THEN 1
           WHEN 'en_cours'   THEN 2
           ELSE 3
         END,
         r.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      values
    ),
  ]);

  return {
    total:        parseInt(totalResult.rows[0].count),
    totalPages:   Math.ceil(parseInt(totalResult.rows[0].count) / limit),
    page,
    reclamations: result.rows,
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET SINGLE RÉCLAMATION (admin uniquement)
// ═══════════════════════════════════════════════════════════
export const getSingleReclamationService = async (reclamationId) => {
  const result = await database.query(
    `SELECT
       r.*,
       u.name   AS user_name,
       u.email  AS user_email,
       u.phone  AS user_phone,
       o.order_number,
       o.status       AS order_status,
       o.total_price  AS order_total,
       o.created_at   AS order_date,
       a.name         AS admin_name
     FROM reclamations r
     LEFT JOIN users  u ON u.id = r.user_id
     LEFT JOIN orders o ON o.id = r.order_id
     LEFT JOIN users  a ON a.id = r.admin_id
     WHERE r.id = $1`,
    [reclamationId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Réclamation introuvable.", 404);

  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// SERVICE — RÉPONDRE À UNE RÉCLAMATION (admin)
// ✅ status + admin_response + délai en une seule action
// ✅ Email automatique au client avec la réponse
// ═══════════════════════════════════════════════════════════
export const respondToReclamationService = async ({
  reclamationId, adminId, status, admin_response, resolution_delay,
}) => {
  if (!VALID_STATUSES.includes(status))
    throw new ErrorHandler(`Statut invalide. Valeurs : ${VALID_STATUSES.join(", ")}`, 400);

  if (!admin_response || admin_response.trim().length < 5)
    throw new ErrorHandler("La réponse doit contenir au moins 5 caractères.", 400);

  // Récupérer la réclamation + infos client pour l'email
  const existing = await database.query(
    `SELECT r.*, u.name AS user_name, u.email AS user_email, o.order_number
     FROM reclamations r
     LEFT JOIN users  u ON u.id = r.user_id
     LEFT JOIN orders o ON o.id = r.order_id
     WHERE r.id = $1`,
    [reclamationId]
  );

  if (existing.rows.length === 0)
    throw new ErrorHandler("Réclamation introuvable.", 404);

  const current = existing.rows[0];

  if (["resolue", "rejetee"].includes(current.status))
    throw new ErrorHandler("Cette réclamation est déjà clôturée.", 400);

  // Calcul deadline si délai fourni (en heures)
  let deadlineAt = null;
  if (resolution_delay && resolution_delay > 0) {
    deadlineAt = new Date(Date.now() + resolution_delay * 60 * 60 * 1000);
  }

  const result = await database.query(
    `UPDATE reclamations
     SET
       status           = $1,
       admin_response   = $2,
       admin_id         = $3,
       responded_at     = NOW(),
       resolution_delay = $4,
       deadline_at      = $5,
       updated_at       = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      status,
      admin_response.trim(),
      adminId,
      resolution_delay || null,
      deadlineAt,
      reclamationId,
    ]
  );

  const reclamation = result.rows[0];

  // ✅ Email automatique au client
  await sendAdminResponseEmail(
    current.user_email,
    current.user_name,
    reclamation,
    current.order_number
  );

  return {
    ...reclamation,
    user_name:    current.user_name,
    user_email:   current.user_email,
    order_number: current.order_number,
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — STATS (admin dashboard)
// ═══════════════════════════════════════════════════════════
export const getReclamationStatsService = async () => {
  const result = await database.query(
    `SELECT
       COUNT(*)                                                    AS total,
       COUNT(*) FILTER (WHERE status = 'en_attente')              AS en_attente,
       COUNT(*) FILTER (WHERE status = 'en_cours')                AS en_cours,
       COUNT(*) FILTER (WHERE status = 'resolue')                 AS resolues,
       COUNT(*) FILTER (WHERE status = 'rejetee')                 AS rejetees,
       ROUND(
         AVG(
           EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600
         ) FILTER (WHERE responded_at IS NOT NULL)
       )                                                           AS avg_response_hours,
       COUNT(*) FILTER (
         WHERE deadline_at IS NOT NULL
           AND deadline_at < NOW()
           AND status NOT IN ('resolue', 'rejetee')
       )                                                           AS en_retard
     FROM reclamations`
  );
  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// SERVICE — CRÉER RÉCLAMATION GUEST
// Vérification : email + order_number
// ═══════════════════════════════════════════════════════════
export const createGuestReclamationService = async ({
  email, order_number, reclamation_type, message,
}) => {
  if (!VALID_TYPES.includes(reclamation_type))
    throw new ErrorHandler(`Type invalide.`, 400);

  if (!message || message.trim().length < 10)
    throw new ErrorHandler("Message trop court (min 10 caractères).", 400);

  if (!email || !order_number)
    throw new ErrorHandler("Email et numéro de commande obligatoires.", 400);

  // ── Trouver la commande par order_number ─────────────────
  const orderResult = await database.query(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.user_id
     FROM orders o
     WHERE o.order_number = $1`,
    [order_number.trim().toUpperCase()]
  );

  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Numéro de commande introuvable.", 404);

  const order = orderResult.rows[0];

  // ── Trouver le user lié à cette commande ─────────────────
  const userResult = await database.query(
    `SELECT id, name, email FROM users WHERE id = $1`,
    [order.user_id]
  );

  if (userResult.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  const user = userResult.rows[0];

  // ── Vérifier que l'email correspond ─────────────────────
  if (user.email.toLowerCase() !== email.trim().toLowerCase())
    throw new ErrorHandler(
      "Aucune commande trouvée avec ce numéro et cette adresse email.", 403
    );

  // ── Vérifier commande éligible ───────────────────────────
  if (order.payment_status !== "paye")
    throw new ErrorHandler("Cette commande n'est pas encore payée.", 400);

  // ── Vérifier pas de réclamation active du même type ─────
  const existing = await database.query(
    `SELECT id FROM reclamations
     WHERE order_id         = $1
       AND user_id          = $2
       AND reclamation_type = $3
       AND status NOT IN ('resolue', 'rejetee')`,
    [order.id, user.id, reclamation_type]
  );

  if (existing.rows.length > 0)
    throw new ErrorHandler(
      "Une réclamation active de ce type existe déjà pour cette commande.", 409
    );

  // ── Insérer la réclamation ───────────────────────────────
  const result = await database.query(
    `INSERT INTO reclamations (user_id, order_id, reclamation_type, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user.id, order.id, reclamation_type, message.trim()]
  );

  const reclamation = result.rows[0];

  // ── Email confirmation au guest ──────────────────────────
  await sendReclamationConfirmationEmail(
    user.email,
    user.name,
    reclamation,
    order.order_number
  );

  return {
    ...reclamation,
    user_name:    user.name,
    order_number: order.order_number,
  };
};