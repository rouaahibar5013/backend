import express from "express";
import {
  getOffresData,
  validatePromoCode,
} from "../controllers/offresController.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────
router.get("/",               getOffresData);
router.post("/validate-promo", validatePromoCode);

export default router;