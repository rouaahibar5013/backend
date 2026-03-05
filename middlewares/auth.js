import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "./catchAsyncError.js";
import ErrorHandler from "./errorMiddleware.js";
import database from "../database/db.js";

// Checks if the user is logged in
// Reads the JWT from the Authorization header
// and attaches the user to req.user
export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token)
    return next(new ErrorHandler("Please login to access this resource.", 401));

  // Decode the token and find the user in DB
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const result  = await database.query(
    "SELECT * FROM users WHERE id = $1", [decoded.id]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  req.user = result.rows[0]; // attach user to request
  next();
});

// Checks if the logged-in user is an admin
// Always use AFTER isAuthenticated
export const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return next(new ErrorHandler("Access denied. Admins only.", 403));
  next();
};