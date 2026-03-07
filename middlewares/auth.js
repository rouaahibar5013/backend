import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "./catchAsyncErrors.js";
import ErrorHandler from "./errorMiddleware.js";
import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// IS AUTHENTICATED
// Reads the JWT token from the cookie (not the header)
// Attaches the user to req.user for the next middleware
// ═══════════════════════════════════════════════════════════
export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
  // ── Read token from cookie ────────────────────────────
  // The cookie was set by sendToken() after login/register
  const token = req.cookies.token;

  if (!token) {
    return next(new ErrorHandler("Please login to access this resource.", 401));
  }

  // ── Verify the token is valid and not expired ─────────
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // ── Find the user in database ─────────────────────────
  const result = await database.query(
    "SELECT id, name, email, avatar, role FROM users WHERE id = $1",
    [decoded.id]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("User not found.", 404));
  }

  // ── Attach user to request ────────────────────────────
  // Now any controller can access req.user
  req.user = result.rows[0];
  next();
});


// ═══════════════════════════════════════════════════════════
// IS ADMIN
// Must be used AFTER isAuthenticated
// Blocks access if the user is not an admin
// ═══════════════════════════════════════════════════════════
export const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(
      new ErrorHandler("Access denied. Admins only.", 403)
    );
  }
  next();
};