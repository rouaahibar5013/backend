import express from "express";
import {
  subscribe,
  unsubscribe,
  createCampaign,
  sendCampaign,
  getAllCampaigns,
  getAllSubscribers,
} from "../controllers/emailcampaignController.js";
import { isAuthenticated, isAdmin, optionalAuth } from "../middlewares/auth.js";


const router = express.Router();

// ── Public ───────────────────────────────────────────────
router.post("/subscribe", optionalAuth, subscribe);
router.post("/unsubscribe", unsubscribe);

// ── Admin only ───────────────────────────────────────────
router.get("/",                          isAuthenticated, isAdmin, getAllCampaigns);
router.get("/subscribers",               isAuthenticated, isAdmin, getAllSubscribers);
router.post("/",                         isAuthenticated, isAdmin, createCampaign);
router.post("/:campaignId/send",         isAuthenticated, isAdmin, sendCampaign);

export default router;