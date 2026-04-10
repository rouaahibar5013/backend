import express from "express";
import { getStats } from "../controllers/statsController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";
import { exportStats } from "../controllers/statsController.js";

const router = express.Router();

// ── Admin only ───────────────────────────────────────────
router.get("/", isAuthenticated, isAdmin, getStats);
router.get("/export", isAuthenticated, isAdmin, exportStats);

export default router;