import { EmailSubscription, EmailCampaign, Promotion } from "../models/index.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail    from "../utils/sendEmail.js";


// ─── Helper email template ────────────────────────────────
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
      <div style="background: ${style.bg}; padding: 40px 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900;">🌿 GOFFA</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">artisanat</p>
        <div style="background: rgba(255,255,255,0.2); display: inline-block; padding: 8px 20px; border-radius: 50px; margin-top: 16px;">
          <span style="color: white; font-weight: 700; font-size: 14px; letter-spacing: 2px;">${style.badge}</span>
        </div>
      </div>
      <div style="padding: 40px 30px; background: white;">
        <h2 style="color: #1a1a1a; font-size: 26px; font-weight: 900; margin: 0 0 16px;">${title}</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px;">${content_fr}</p>
        ${promoCode ? `
        <div style="background: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="color: #059669; font-weight: 700; font-size: 14px; margin: 0 0 8px; letter-spacing: 2px;">VOTRE CODE PROMO</p>
          <div style="background: #059669; color: white; font-size: 28px; font-weight: 900; padding: 12px 32px; border-radius: 8px; display: inline-block; letter-spacing: 4px;">${promoCode}</div>
          <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">${promoValue}% de réduction sur votre commande</p>
        </div>` : ''}
        <div style="text-align: center; margin: 32px 0;">
          <a href="${process.env.FRONTEND_URL}/offres"
             style="background: ${style.bg}; color: white; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
            Voir les offres →
          </a>
        </div>
      </div>
      <div style="background: #f3f4f6; padding: 24px 30px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Vous recevez cet email car vous êtes abonné à nos offres.</p>
        <a href="${process.env.FRONTEND_URL}/unsubscribe" style="color: #9ca3af; font-size: 12px; text-decoration: underline;">Se désabonner</a>
      </div>
    </div>
  `;
};


// ═══════════════════════════════════════════════════════════
// SUBSCRIBE
// ═══════════════════════════════════════════════════════════
export const subscribeEmailService = async ({ email, name, userId }) => {
  const existing = await EmailSubscription.findByEmail(email);

  if (existing) {
    if (existing.is_active) throw new ErrorHandler("Vous êtes déjà abonné à nos offres.", 400);
    return await EmailSubscription.reactivate(email, name || existing.name);
  }

  return await EmailSubscription.create({ userId: userId || null, email, name: name || null });
};


// ═══════════════════════════════════════════════════════════
// UNSUBSCRIBE
// ═══════════════════════════════════════════════════════════
export const unsubscribeEmailService = async (email) => {
  const result = await EmailSubscription.deactivate(email);
  if (!result) throw new ErrorHandler("Email introuvable.", 404);
};


// ═══════════════════════════════════════════════════════════
// CREATE CAMPAIGN (admin)
// ═══════════════════════════════════════════════════════════
export const createCampaignService = async ({ title, subject, type, content_fr, scheduled_at }) => {
  const validTypes = ['promotion', 'black_friday', 'nouveautes', 'flash_sale'];
  if (!validTypes.includes(type))
    throw new ErrorHandler(`Type invalide. Doit être : ${validTypes.join(', ')}`, 400);

  return await EmailCampaign.create({
    title, subject, type, content_fr,
    status:       scheduled_at ? 'scheduled' : 'draft',
    scheduled_at: scheduled_at || null,
  });
};


// ═══════════════════════════════════════════════════════════
// SEND CAMPAIGN (admin)
// ═══════════════════════════════════════════════════════════
export const sendCampaignService = async ({ campaignId, promoCode }) => {
  const camp = await EmailCampaign.findById(campaignId);
  if (!camp) throw new ErrorHandler("Campagne introuvable.", 404);
  if (camp.status === 'sent') throw new ErrorHandler("Cette campagne a déjà été envoyée.", 400);

  let promoValue = null;
  if (promoCode) {
    const promo = await Promotion.findValidByCode(promoCode);
    if (promo) promoValue = promo.discount_value;
  }

  const subscribers = await EmailSubscription.findAllActive();
  if (subscribers.length === 0) throw new ErrorHandler("Aucun abonné actif.", 400);

  const html = buildEmailTemplate({
    type: camp.type, title: camp.title,
    content_fr: camp.content_fr,
    promoCode: promoCode || null, promoValue: promoValue || null,
  });

  let sentCount  = 0;
  const batchSize = 50;

  for (let i = 0; i < subscribers.length; i += batchSize) {
    const batch = subscribers.slice(i, i + batchSize);
    await Promise.all(
      batch.map(s =>
        sendEmail({ to: s.email, subject: camp.subject, html })
          .catch(err => console.error(`Erreur envoi à ${s.email}:`, err.message))
      )
    );
    sentCount += batch.length;
  }

  await EmailCampaign.markSent(campaignId, sentCount);
  return { sentCount };
};


// ═══════════════════════════════════════════════════════════
// GET ALL CAMPAIGNS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllCampaignsService = async () => {
  return await EmailCampaign.findAll();
};


// ═══════════════════════════════════════════════════════════
// GET ALL SUBSCRIBERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllSubscribersService = async () => {
  const subscribers = await EmailSubscription.findAllWithUser();
  const total       = subscribers.length;
  const active      = subscribers.filter(s => s.is_active).length;
  return { total, active, subscribers };
};


// ═══════════════════════════════════════════════════════════
// AUTO SEND PROMO EMAIL
// ═══════════════════════════════════════════════════════════
export const autoSendPromoEmailService = async ({ promoCode, type, title, description }) => {
  const campaign = await EmailCampaign.create({
    title, subject: `🎉 ${title} — GOFFA`,
    type, content_fr: description, status: 'draft',
  });

  await sendCampaignService({ campaignId: campaign.id, promoCode });
};


// ═══════════════════════════════════════════════════════════
// LINK SUBSCRIPTION TO USER
// ═══════════════════════════════════════════════════════════
export const linkSubscriptionToUserService = async ({ userId, email }) => {
  await EmailSubscription.linkToUser(userId, email);
};