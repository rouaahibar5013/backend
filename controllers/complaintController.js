import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// CREATE COMPLAINT
// POST /api/complaints
// Requires: isAuthenticated
// Body: { subject, message }
// ═══════════════════════════════════════════════════════════
export const createComplaint = catchAsyncErrors(async (req, res, next) => {
  const { subject, message } = req.body;

  if (!subject || !message)
    return next(new ErrorHandler("Please provide subject and message.", 400));

  if (subject.length < 5)
    return next(new ErrorHandler("Subject must be at least 5 characters.", 400));

  if (message.length < 20)
    return next(new ErrorHandler("Message must be at least 20 characters.", 400));

  const result = await database.query(
    `INSERT INTO complaints (user_id, subject, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.user.id, subject, message]
  );

  res.status(201).json({
    success:   true,
    message:   "Complaint submitted successfully.",
    complaint: result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// GET MY COMPLAINTS
// GET /api/complaints/my
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const getMyComplaints = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT * FROM complaints
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  res.status(200).json({
    success:          true,
    totalComplaints:  result.rows.length,
    complaints:       result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// GET SINGLE COMPLAINT
// GET /api/complaints/:complaintId
// Requires: isAuthenticated
// User can only see their own, admin can see all
// ═══════════════════════════════════════════════════════════
export const getSingleComplaint = catchAsyncErrors(async (req, res, next) => {
  const { complaintId } = req.params;

  const condition = req.user.role === "admin"
    ? "id=$1"
    : "id=$1 AND user_id=$2";
  const values = req.user.role === "admin"
    ? [complaintId]
    : [complaintId, req.user.id];

  const result = await database.query(
    `SELECT c.*, u.name AS user_name, u.email AS user_email
     FROM complaints c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE ${condition}`,
    values
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Complaint not found.", 404));

  res.status(200).json({
    success:   true,
    complaint: result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL COMPLAINTS (admin only)
// GET /api/complaints
// Supports: ?status=pending|in_progress|resolved|rejected
// ═══════════════════════════════════════════════════════════
export const getAllComplaints = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.query;

  const conditions = [];
  const values     = [];

  if (status) {
    conditions.push(`c.status=$1`);
    values.push(status);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await database.query(
    `SELECT
       c.*,
       u.name  AS user_name,
       u.email AS user_email
     FROM complaints c
     LEFT JOIN users u ON u.id = c.user_id
     ${whereClause}
     ORDER BY c.created_at DESC`,
    values
  );

  res.status(200).json({
    success:         true,
    totalComplaints: result.rows.length,
    complaints:      result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// REPLY TO COMPLAINT (admin only)
// PUT /api/complaints/:complaintId/reply
// Body: { admin_reply, status }
// ═══════════════════════════════════════════════════════════
export const replyToComplaint = catchAsyncErrors(async (req, res, next) => {
  const { complaintId }        = req.params;
  const { admin_reply, status } = req.body;

  if (!admin_reply)
    return next(new ErrorHandler("Please provide a reply.", 400));

  const validStatuses = ["pending", "in_progress", "resolved", "rejected"];
  if (status && !validStatuses.includes(status))
    return next(new ErrorHandler(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400));

  const complaint = await database.query(
    "SELECT * FROM complaints WHERE id=$1", [complaintId]
  );
  if (complaint.rows.length === 0)
    return next(new ErrorHandler("Complaint not found.", 404));

  const result = await database.query(
    `UPDATE complaints
     SET admin_reply=$1, status=$2, replied_at=NOW()
     WHERE id=$3 RETURNING *`,
    [
      admin_reply,
      status || "in_progress",
      complaintId,
    ]
  );

  res.status(200).json({
    success:   true,
    message:   "Reply sent successfully.",
    complaint: result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE COMPLAINT STATUS (admin only)
// PATCH /api/complaints/:complaintId/status
// Body: { status }
// ═══════════════════════════════════════════════════════════
export const updateComplaintStatus = catchAsyncErrors(async (req, res, next) => {
  const { complaintId } = req.params;
  const { status }      = req.body;

  const validStatuses = ["pending", "in_progress", "resolved", "rejected"];
  if (!status || !validStatuses.includes(status))
    return next(new ErrorHandler(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400));

  const result = await database.query(
    `UPDATE complaints SET status=$1 WHERE id=$2 RETURNING *`,
    [status, complaintId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Complaint not found.", 404));

  res.status(200).json({
    success:   true,
    message:   `Complaint status updated to '${status}'.`,
    complaint: result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// DELETE COMPLAINT (admin only)
// DELETE /api/complaints/:complaintId
// ═══════════════════════════════════════════════════════════
export const deleteComplaint = catchAsyncErrors(async (req, res, next) => {
  const { complaintId } = req.params;

  const result = await database.query(
    "DELETE FROM complaints WHERE id=$1 RETURNING *", [complaintId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Complaint not found.", 404));

  res.status(200).json({
    success: true,
    message: "Complaint deleted successfully.",
  });
});