import express from "express";
import {
  createComplaint,
  getMyComplaints,
  getSingleComplaint,
  getAllComplaints,
  replyToComplaint,
  updateComplaintStatus,
  deleteComplaint,
} from "../controllers/complaintController.js";
import { isAuthenticated, isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ── Client (login required) ──────────────────────────────
router.post("/",                              isAuthenticated, createComplaint);
router.get("/my",                             isAuthenticated, getMyComplaints);
router.get("/:complaintId",                   isAuthenticated, getSingleComplaint);

// ── Admin only ───────────────────────────────────────────
router.get("/",                               isAuthenticated, isAdmin, getAllComplaints);
router.put("/:complaintId/reply",             isAuthenticated, isAdmin, replyToComplaint);
router.patch("/:complaintId/status",          isAuthenticated, isAdmin, updateComplaintStatus);
router.delete("/:complaintId",                isAuthenticated, isAdmin, deleteComplaint);

export default router;