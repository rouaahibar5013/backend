import express from "express";
import {
  getDashboardStats,
  getAllUsers,
  getSingleUser,
  suspendUser,
  activateUser,
  changeUserRole,
  deleteUser,
  getSettings,
  updateSetting,
} from "../controllers/adminController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// All admin routes require authentication + admin role
router.use(isAuthenticated, isAdmin);

// ── Dashboard ────────────────────────────────────────────
router.get("/dashboard",                    getDashboardStats);

// ── Users management ─────────────────────────────────────
router.get("/users",                        getAllUsers);
router.get("/users/:userId",                getSingleUser);
router.patch("/users/:userId/suspend",      suspendUser);
router.patch("/users/:userId/activate",     activateUser);
router.patch("/users/:userId/role",         changeUserRole);
router.delete("/users/:userId",             deleteUser);

// ── Settings ─────────────────────────────────────────────
router.get("/settings",                     getSettings);
router.put("/settings/:key",                updateSetting);

export default router;