import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as emailCampaignService from "../services/emailcampaignService.js";

// ═══════════════════════════════════════════════════════════
// SUBSCRIBE
// POST /api/email-campaigns/subscribe
// Public — tout le monde peut s'abonner
// Body: { email, name }
// ═══════════════════════════════════════════════════════════
export const subscribe = catchAsyncErrors(async (req, res, next) => {
  const { email, name } = req.body;

  if (!email)
    return next(new ErrorHandler("Veuillez fournir un email.", 400));

  const subscription = await emailCampaignService.subscribeEmailService({
    email,
    name,
    userId: req.user?.id || null,
  });

  res.status(201).json({
    success: true,
    message: "Vous êtes maintenant abonné à nos offres !",
    subscription,
  });
});


// ═══════════════════════════════════════════════════════════
// UNSUBSCRIBE
// POST /api/email-campaigns/unsubscribe
// Public
// Body: { email }
// ═══════════════════════════════════════════════════════════
export const unsubscribe = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;

  if (!email)
    return next(new ErrorHandler("Veuillez fournir un email.", 400));

  await emailCampaignService.unsubscribeEmailService(email);

  res.status(200).json({
    success: true,
    message: "Vous avez été désabonné avec succès.",
  });
});


// ═══════════════════════════════════════════════════════════
// CREATE CAMPAIGN (admin)
// POST /api/email-campaigns
// Body: { title, subject, type, content_fr, scheduled_at }
// ═══════════════════════════════════════════════════════════
export const createCampaign = catchAsyncErrors(async (req, res, next) => {
  const { title, subject, type, content_fr, scheduled_at } = req.body;

  if (!title || !subject || !type || !content_fr)
    return next(new ErrorHandler("Veuillez fournir title, subject, type et content_fr.", 400));

  const campaign = await emailCampaignService.createCampaignService({
    title, subject, type, content_fr, scheduled_at,
  });

  res.status(201).json({
    success: true,
    message: "Campagne créée avec succès.",
    campaign,
  });
});


// ═══════════════════════════════════════════════════════════
// SEND CAMPAIGN (admin)
// POST /api/email-campaigns/:campaignId/send
// Body: { promoCode } (optionnel)
// ═══════════════════════════════════════════════════════════
export const sendCampaign = catchAsyncErrors(async (req, res, next) => {
  const { campaignId } = req.params;
  const { promoCode }  = req.body;

  const { sentCount } = await emailCampaignService.sendCampaignService({
    campaignId,
    promoCode: promoCode || null,
  });

  res.status(200).json({
    success: true,
    message: `Campagne envoyée avec succès à ${sentCount} abonnés.`,
    sentCount,
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL CAMPAIGNS (admin)
// GET /api/email-campaigns
// ═══════════════════════════════════════════════════════════
export const getAllCampaigns = catchAsyncErrors(async (req, res, next) => {
  const campaigns = await emailCampaignService.getAllCampaignsService();

  res.status(200).json({
    success:        true,
    totalCampaigns: campaigns.length,
    campaigns,
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL SUBSCRIBERS (admin)
// GET /api/email-campaigns/subscribers
// ═══════════════════════════════════════════════════════════
export const getAllSubscribers = catchAsyncErrors(async (req, res, next) => {
  const data = await emailCampaignService.getAllSubscribersService();

  res.status(200).json({
    success: true,
    ...data,
  });
});