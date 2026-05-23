import express from "express";
import { getStats, exportStats, clearCache } from "../controllers/statsController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Admin only ───────────────────────────────────────────
router.get("/", isAuthenticated, isAdmin, getStats);
router.get("/export", isAuthenticated, isAdmin, exportStats);
router.delete("/cache/clear", isAuthenticated, isAdmin, clearCache);
export default router;