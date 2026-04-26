import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "./catchAsyncErrors.js";
import ErrorHandler from "./errorMiddleware.js";
import { isTokenBlacklisted } from "../utils/tokenBlacklist.js";
import database from "../database/db.js";
import { getUserById } from "../services/authService.js";

// ═══════════════════════════════════════════════════════════
// IS AUTHENTICATED
// Reads the JWT token from the cookie (not the header)
// Attaches the user to req.user for the next middleware
// ═══════════════════════════════════════════════════════════

export const isAuthenticated = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token)
    return next(new ErrorHandler("Non authentifié. Veuillez vous connecter.", 401));

  // ✅ Vérifier la blacklist Redis avant tout
  const revoked = await isTokenBlacklisted(token);
  if (revoked)
    return next(new ErrorHandler("Session révoquée. Veuillez vous reconnecter.", 401));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await getUserById(decoded.id); // votre logique existante
    next();
  } catch {
    return next(new ErrorHandler("Token invalide ou expiré.", 401));
  }
};


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
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.token 
               || req.headers?.authorization?.split(" ")[1];
    

    
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    
    const result = await database.query(
      "SELECT id, name, email, avatar, role, is_active FROM users WHERE id = $1",
      [decoded.id]
    );
    
    if (result.rows.length > 0 && result.rows[0].is_active !== false) {
      req.user = result.rows[0];
    }
    next();
  } catch (err) {
    next();
  }
};