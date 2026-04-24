import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail from "../utils/sendEmail.js";

// ═══════════════════════════════════════════════════════════
// HELPER — template email selon le type de campagne
// ═══════════════════════════════════════════════════════════
const buildEmailTemplate = ({ type, title, content_fr, promoCode, promoValue }) => {
  const colors = {
    promotion:    { bg: '#059669', badge: '🎉 PROMOTION' },
    black_friday: { bg: '#1a1a1a', badge: '🖤 BLACK FRIDAY' },
    nouveautes:   { bg: '#3b82f6', badge: '✨ NOUVEAUTÉS' },
    flash_sale:   { bg: '#dc2626', badge: '⚡ OFFRE FLASH' },
  };

  const style = colors[type] || colors.promotion;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
      
      <!-- HEADER -->
      <div style="background: ${style.bg}; padding: 40px 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900;">
          🌿 GOFFA
        </h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">
          artisanat
        </p>
        <div style="background: rgba(255,255,255,0.2); display: inline-block; padding: 8px 20px; border-radius: 50px; margin-top: 16px;">
          <span style="color: white; font-weight: 700; font-size: 14px; letter-spacing: 2px;">
            ${style.badge}
          </span>
        </div>
      </div>

      <!-- CONTENU -->
      <div style="padding: 40px 30px; background: white;">
        <h2 style="color: #1a1a1a; font-size: 26px; font-weight: 900; margin: 0 0 16px;">
          ${title}
        </h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px;">
          ${content_fr}
        </p>

        ${promoCode ? `
        <!-- CODE PROMO -->
        <div style="background: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="color: #059669; font-weight: 700; font-size: 14px; margin: 0 0 8px; letter-spacing: 2px;">
            VOTRE CODE PROMO
          </p>
          <div style="background: #059669; color: white; font-size: 28px; font-weight: 900; padding: 12px 32px; border-radius: 8px; display: inline-block; letter-spacing: 4px;">
            ${promoCode}
          </div>
          <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">
            ${promoValue}% de réduction sur votre commande
          </p>
        </div>
        ` : ''}

        <!-- BOUTON CTA -->
        <div style="text-align: center; margin: 32px 0;">
          <a href="${process.env.FRONTEND_URL}/offres"
             style="background: ${style.bg}; color: white; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
            Voir les offres →
          </a>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="background: #f3f4f6; padding: 24px 30px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Vous recevez cet email car vous êtes abonné à nos offres.
        </p>
        <a href="${process.env.FRONTEND_URL}/unsubscribe"
           style="color: #9ca3af; font-size: 12px; text-decoration: underline;">
          Se désabonner
        </a>
      </div>

    </div>
  `;
};


// ═══════════════════════════════════════════════════════════
// SUBSCRIBE TO EMAIL LIST
// ═══════════════════════════════════════════════════════════
export const subscribeEmailService = async ({ email, name, userId }) => {
  // Vérifier si déjà abonné
  const existing = await database.query(
    "SELECT * FROM email_subscriptions WHERE email=$1", [email]
  );

  if (existing.rows.length > 0) {
    if (existing.rows[0].is_active)
      throw new ErrorHandler("Vous êtes déjà abonné à nos offres.", 400);

    // Réabonnement
    const result = await database.query(
      `UPDATE email_subscriptions
       SET is_active=true, unsubscribed_at=NULL, name=$1
       WHERE email=$2 RETURNING *`,
      [name || existing.rows[0].name, email]
    );
    return result.rows[0];
  }

  // Nouvel abonnement
  const result = await database.query(
    `INSERT INTO email_subscriptions (user_id, email, name)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId || null, email, name || null]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// UNSUBSCRIBE FROM EMAIL LIST
// ═══════════════════════════════════════════════════════════
export const unsubscribeEmailService = async (email) => {
  const result = await database.query(
    `UPDATE email_subscriptions
     SET is_active=false, unsubscribed_at=NOW()
     WHERE email=$1 RETURNING *`,
    [email]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Email introuvable.", 404);
};


// ═══════════════════════════════════════════════════════════
// CREATE CAMPAIGN (admin)
// ═══════════════════════════════════════════════════════════
export const createCampaignService = async ({
  title, subject, type, content_fr, scheduled_at
}) => {
  const validTypes = ['promotion', 'black_friday', 'nouveautes', 'flash_sale'];
  if (!validTypes.includes(type))
    throw new ErrorHandler(`Type invalide. Doit être : ${validTypes.join(', ')}`, 400);

  const result = await database.query(
    `INSERT INTO email_campaigns
      (title, subject, type, content_fr, status, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      title,
      subject,
      type,
      content_fr,
      scheduled_at ? 'scheduled' : 'draft',
      scheduled_at || null,
    ]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// SEND CAMPAIGN (admin)
// Envoie l'email à tous les subscribers actifs
// ═══════════════════════════════════════════════════════════
export const sendCampaignService = async ({ campaignId, promoCode }) => {
  // Récupérer la campagne
  const campaign = await database.query(
    "SELECT * FROM email_campaigns WHERE id=$1", [campaignId]
  );
  if (campaign.rows.length === 0)
    throw new ErrorHandler("Campagne introuvable.", 404);

  const camp = campaign.rows[0];

  if (camp.status === 'sent')
    throw new ErrorHandler("Cette campagne a déjà été envoyée.", 400);

  // Récupérer le code promo si fourni
  let promoValue = null;
  if (promoCode) {
    const promo = await database.query(
      "SELECT discount_value FROM promotions WHERE code=$1 AND is_active=true", [promoCode]
    );
    if (promo.rows.length > 0)
      promoValue = promo.rows[0].discount_value;
  }

  // Récupérer tous les subscribers actifs
  const subscribers = await database.query(
    "SELECT email, name FROM email_subscriptions WHERE is_active=true"
  );

  if (subscribers.rows.length === 0)
    throw new ErrorHandler("Aucun abonné actif.", 400);

  // Construire le template
  const html = buildEmailTemplate({
    type:       camp.type,
    title:      camp.title,
    content_fr: camp.content_fr,
    promoCode:  promoCode  || null,
    promoValue: promoValue || null,
  });

  // ✅ Envoyer à tous les subscribers en parallèle
  let sentCount = 0;
  const batchSize = 50; // Envoyer par lots de 50

  for (let i = 0; i < subscribers.rows.length; i += batchSize) {
    const batch = subscribers.rows.slice(i, i + batchSize);
    await Promise.all(
      batch.map(subscriber =>
        sendEmail({
          to:      subscriber.email,
          subject: camp.subject,
          html,
        }).catch(err => {
          console.error(`Erreur envoi à ${subscriber.email}:`, err.message);
        })
      )
    );
    sentCount += batch.length;
  }

  // Mettre à jour le statut de la campagne
  await database.query(
    `UPDATE email_campaigns
     SET status='sent', sent_at=NOW(), sent_count=$1
     WHERE id=$2`,
    [sentCount, campaignId]
  );

  return { sentCount };
};


// ═══════════════════════════════════════════════════════════
// GET ALL CAMPAIGNS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllCampaignsService = async () => {
  const result = await database.query(
    `SELECT * FROM email_campaigns ORDER BY created_at DESC`
  );
  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// GET ALL SUBSCRIBERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllSubscribersService = async () => {
  const result = await database.query(
    `SELECT
       es.*,
       u.name AS user_name
     FROM email_subscriptions es
     LEFT JOIN users u ON u.id = es.user_id
     ORDER BY es.subscribed_at DESC`
  );

  const total  = result.rows.length;
  const active = result.rows.filter(s => s.is_active).length;

  return { total, active, subscribers: result.rows };
};


// ═══════════════════════════════════════════════════════════
// AUTO SEND — appelé automatiquement quand admin crée une promo
// ═══════════════════════════════════════════════════════════
export const autoSendPromoEmailService = async ({ promoCode, type, title, description }) => {
  // Créer la campagne automatiquement
  const campaign = await database.query(
    `INSERT INTO email_campaigns
      (title, subject, type, content_fr, status)
     VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
    [
      title,
      `🎉 ${title} — GOFFA`,
      type,
      description,
    ]
  );

  // Envoyer immédiatement
  await sendCampaignService({
    campaignId: campaign.rows[0].id,
    promoCode,
  });
};
// ═══════════════════════════════════════════════════════════
// LINK SUBSCRIPTION TO USER — appelé après register et login
// ═══════════════════════════════════════════════════════════
export const linkSubscriptionToUserService = async ({ userId, email }) => {
  await database.query(
    `UPDATE email_subscriptions
     SET user_id = $1
     WHERE email = $2 AND user_id IS NULL`,
    [userId, email]
  );
};