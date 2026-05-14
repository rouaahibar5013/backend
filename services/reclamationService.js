import { Reclamation, User, Order } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail    from "../utils/sendEmail.js";
import { invalidateDashboardCache } from "../utils/cacheInvalideation.js";
import { notifyUser, notifyAdmins } from "../utils/websocket.js";
import Stripe from "stripe";

const VALID_STATUSES = ["en_attente", "en_cours", "urgente", "en_retard", "resolue", "rejetee"];

const VALID_TYPES = [
  "produit_defectueux", "commande_non_recue", "produit_incorrect",
  "retard_livraison", "remboursement", "autre",
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
  en_attente : "En attente",
  en_cours   : "En cours de traitement",
  urgente    : "Urgente ⚡",
  en_retard  : "En retard ⏰",
  resolue    : "Résolue",
  rejetee    : "Rejetée",
};


// ═══════════════════════════════════════════════════════════
// HELPERS EMAIL
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
            <p><strong>Type :</strong> ${TYPE_LABELS[reclamation.complaint_type] || reclamation.complaint_type}</p>
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
// GET COMMANDES ÉLIGIBLES
// ═══════════════════════════════════════════════════════════
export const getEligibleOrdersService = async (userId) => {
  return await Order.findEligibleForReclamation(userId);
};


// ═══════════════════════════════════════════════════════════
// CRÉER UNE RÉCLAMATION (user authentifié)
// ═══════════════════════════════════════════════════════════
export const createReclamationService = async ({
  userId, order_id, complaint_type, message,
}) => {
  if (!VALID_TYPES.includes(complaint_type))
    throw new ErrorHandler(`Type invalide. Valeurs acceptées : ${VALID_TYPES.join(", ")}`, 400);

  if (!message || message.trim().length < 10)
    throw new ErrorHandler("Le message doit contenir au moins 10 caractères.", 400);

  const user = await User.findById(userId);
  if (!user) throw new ErrorHandler("Utilisateur introuvable.", 404);

  let order = null;
  if (order_id) {
    order = await Order.findByIdAndUser(order_id, userId);
    if (!order)
      throw new ErrorHandler("Commande introuvable ou vous n'êtes pas autorisé à réclamer sur cette commande.", 403);

    const existing = await Reclamation.findActiveByOrderAndType(order_id, userId, complaint_type);
    if (existing)
      throw new ErrorHandler("Vous avez déjà une réclamation active de ce type pour cette commande.", 409);
  }

  const reclamation = await Reclamation.create({
    
    user_id: userId, order_id: order_id || null,
    complaint_type, message: message.trim(),
  });
  if (order_id && order && order.status === "livree") {
  await Order.updateStatus(order_id, "en_reclamation");
}

  await invalidateDashboardCache();

  await sendReclamationConfirmationEmail(user.email, user.name, reclamation, order?.order_number || null);

  notifyAdmins({
    type:       "NEW_RECLAMATION",
    id:         reclamation.id,
    user_name:  user.name,
    type_label: TYPE_LABELS[reclamation.complaint_type],
    message:    `Nouvelle réclamation de ${user.name}`,
  });

  return { ...reclamation, user_name: user.name, order_number: order?.order_number || null };
};


// ═══════════════════════════════════════════════════════════
// GET TOUTES LES RÉCLAMATIONS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllReclamationsService = async ({ status, type, page = 1 }) => {
  return await Reclamation.findAllAdmin({ status, type, page });
};


// ═══════════════════════════════════════════════════════════
// GET SINGLE RÉCLAMATION (admin)
// ═══════════════════════════════════════════════════════════
export const getSingleReclamationService = async (reclamationId) => {
  const reclamation = await Reclamation.findByIdFull(reclamationId);
  if (!reclamation) throw new ErrorHandler("Réclamation introuvable.", 404);
  return reclamation;
};


// ═══════════════════════════════════════════════════════════
// RÉPONDRE À UNE RÉCLAMATION (admin)
// ═══════════════════════════════════════════════════════════
export const respondToReclamationService = async ({
  reclamationId, adminId, status, admin_response, resolution_delay,
}) => {
  if (!VALID_STATUSES.includes(status))
    throw new ErrorHandler(`Statut invalide. Valeurs : ${VALID_STATUSES.join(", ")}`, 400);

  if (!admin_response || admin_response.trim().length < 5)
    throw new ErrorHandler("La réponse doit contenir au moins 5 caractères.", 400);

  const current = await Reclamation.findByIdFull(reclamationId);
  if (!current) throw new ErrorHandler("Réclamation introuvable.", 404);

  if (["resolue", "rejetee"].includes(current.status))
    throw new ErrorHandler("Cette réclamation est déjà clôturée.", 400);

  let deadlineAt = null;
  if (resolution_delay && resolution_delay > 0)
    deadlineAt = new Date(Date.now() + resolution_delay * 60 * 60 * 1000);

  const reclamation = await Reclamation.respondFull(reclamationId, {
    admin_id:         adminId,
    admin_response:   admin_response.trim(),
    status,
    resolution_delay: resolution_delay || null,
    deadline_at:      deadlineAt,
  })
  
  
  if (current.order_id) {
  const order = await Order.findById(current.order_id);

  if (status === "resolue" && avec_remboursement) {
    // Admin accepte avec remboursement → retournee → (webhook → remboursee)
    await Order.markReturned(current.order_id);
    if (order?.payment_status === "paye" && order?.payment_id) {
      await stripe.refunds.create({ payment_intent: order.payment_id });
    }

  } else if (status === "resolue" && !avec_remboursement) {
    // Admin accepte sans remboursement → clôturée
    await Order.updateStatus(current.order_id, "reclamation_refusee");

  } else if (status === "rejetee") {
    // Admin refuse → END
    await Order.updateStatus(current.order_id, "reclamation_refusee");
  }
}
  
  ;

  await invalidateDashboardCache();

  await sendAdminResponseEmail(current.user_email, current.user_name, reclamation, current.order_number);

  notifyUser(current.user_id, {
    type:          "RECLAMATION_UPDATE",
    id:            reclamation.id,
    status:        reclamation.status,
    admin_response: reclamation.admin_response,
    message:       "Votre réclamation a reçu une réponse.",
  });

  return { ...reclamation, user_name: current.user_name, user_email: current.user_email, order_number: current.order_number };
};


// ═══════════════════════════════════════════════════════════
// STATS (admin dashboard)
// ═══════════════════════════════════════════════════════════
export const getReclamationStatsService = async () => {
  return await Reclamation.getStats();
};


// ═══════════════════════════════════════════════════════════
// CRÉER RÉCLAMATION GUEST
// ═══════════════════════════════════════════════════════════
export const createGuestReclamationService = async ({
  email, order_number, complaint_type, message,
}) => {
  if (!VALID_TYPES.includes(complaint_type))
    throw new ErrorHandler("Type invalide.", 400);

  if (!message || message.trim().length < 10)
    throw new ErrorHandler("Message trop court (min 10 caractères).", 400);

  if (!email || !order_number)
    throw new ErrorHandler("Email et numéro de commande obligatoires.", 400);

  const order = await Order.findByOrderNumber(order_number.trim().toUpperCase());
  if (!order) throw new ErrorHandler("Numéro de commande introuvable.", 404);

  const user = await User.findById(order.user_id);
  if (!user) throw new ErrorHandler("Utilisateur introuvable.", 404);

  if (user.email.toLowerCase() !== email.trim().toLowerCase())
    throw new ErrorHandler("Aucune commande trouvée avec ce numéro et cette adresse email.", 403);

  if (order.payment_status !== "paye")
    throw new ErrorHandler("Cette commande n'est pas encore payée.", 400);

  const existing = await Reclamation.findActiveByOrderAndType(order.id, user.id, complaint_type);
  if (existing)
    throw new ErrorHandler("Une réclamation active de ce type existe déjà pour cette commande.", 409);

  const reclamation = await Reclamation.create({
    user_id: user.id, order_id: order.id,
    complaint_type, message: message.trim(),
  });

  await invalidateDashboardCache();

  await sendReclamationConfirmationEmail(user.email, user.name, reclamation, order.order_number);

  notifyAdmins({
    type:       "NEW_RECLAMATION",
    id:         reclamation.id,
    user_name:  user.name,
    type_label: TYPE_LABELS[reclamation.complaint_type],
    message:    `Nouvelle réclamation (guest) de ${user.name}`,
  });

  return { ...reclamation, user_name: user.name, order_number: order.order_number };
};


// ═══════════════════════════════════════════════════════════
// GET MES RÉCLAMATIONS (user connecté)
// ═══════════════════════════════════════════════════════════
export const getMyReclamationsService = async (userId) => {
  return await Reclamation.findByUserId(userId);
};