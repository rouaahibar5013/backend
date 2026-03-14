import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "./catchAsyncErrors.js";
import ErrorHandler from "./errorMiddleware.js";
import database from "../database/db.js";

export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return next(new ErrorHandler("Please login to access this resource.", 401));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const result = await database.query(
    // ✅ Ajoute is_active dans le SELECT
    "SELECT id, name, email, avatar, role, is_active FROM users WHERE id = $1",
    [decoded.id]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("User not found.", 404));
  }

  // ✅ Bloque les users suspendus
  if (!result.rows[0].is_active) {
    return next(new ErrorHandler("Your account has been suspended. Please contact support.", 403));
  }

  req.user = result.rows[0];
  next();
});

export const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ErrorHandler("Access denied. Admins only.", 403));
  }
  next();
};