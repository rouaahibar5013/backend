// middlewares/auth.js

import jwt                   from "jsonwebtoken";
import { query }             from "../database/db.js";
import ErrorHandler          from "./errorMiddleware.js";
import { catchAsyncErrors }  from "./catchAsyncErrors.js";

export const protect = catchAsyncErrors(async (req, res, next) => {
  // Lit le token depuis le cookie httpOnly (mis par sendToken)
  const token = req.cookies?.token;

  if (!token) {
    return next(new ErrorHandler("Veuillez vous connecter.", 401));
  }

  // Vérifie et décode le token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Vérifie que l'utilisateur existe toujours en base
  const { rows } = await query(
    `SELECT id, name, email, avatar, role, is_active
     FROM users WHERE id = $1`,
    [decoded.id]
  );

  if (rows.length === 0) {
    return next(new ErrorHandler("Utilisateur introuvable.", 401));
  }

  if (!rows[0].is_active) {
    return next(new ErrorHandler("Compte désactivé. Contactez le support.", 403));
  }

  req.user = rows[0];
  next();
});

export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ErrorHandler("Accès refusé. Droits admin requis.", 403));
  }
  next();
};