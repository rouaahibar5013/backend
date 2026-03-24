import express from "express";
import { getStats } from "../controllers/statsController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", isAuthenticated, isAdmin, getStats);

export default router;