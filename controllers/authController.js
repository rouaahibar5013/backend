// ============================================================
//  controllers/authController.js
//  Utilise : sendToken, catchAsyncErrors, ErrorHandler, query
// ============================================================

import crypto                   from "crypto";
import bcrypt                   from "bcryptjs";
import { query, getClient }     from "../database/db.js";
import { sendToken } from "../utils/jwtToken.js";
import { catchAsyncErrors }     from "../middlewares/catchAsyncErrors.js";
import ErrorHandler             from "../middlewares/errorMiddleware.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../utils/email.js";

// ── Helper interne ────────────────────────────────────────────
// Génère un token aléatoire sécurisé
//   raw    → envoyé à l'utilisateur (dans l'URL du mail)
//   hashed → stocké en base (SHA-256, ne jamais stocker le raw)
const generateSecureToken = () => {
  const raw    = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hashed };
};

// ── Colonnes publiques à retourner au client (sans password, tokens...) ──
const PUBLIC_FIELDS = `id, name, email, avatar, role, is_email_verified, is_active, last_login, created_at`;

// ============================================================
//  POST /api/auth/register — Inscription
// ============================================================
export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Vérification : email déjà utilisé ?
  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return next(new ErrorHandler("Un compte existe déjà avec cet email.", 409));
  }

  // Hash du mot de passe (bcrypt, 12 rounds)
  const passwordHash = await bcrypt.hash(password, 12);

  // Token de vérification email (valable 24h)
  const { raw: verifyToken, hashed: hashedVerifyToken } = generateSecureToken();
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Insertion en base
  const { rows } = await query(
    `INSERT INTO users
       (name, email, password, email_verification_token, email_verification_expires)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_FIELDS}`,
    [name, email, passwordHash, hashedVerifyToken, verifyExpires]
  );

  const user = rows[0];

  // Envoi email de vérification (ne bloque pas la réponse)
  sendVerificationEmail(user.email, user.name, verifyToken)
    .catch((err) => console.error("Email vérification :", err.message));

  // sendToken : génère le JWT et l'envoie dans un cookie httpOnly
  sendToken(user, 201, "Compte créé ! Vérifiez votre email pour l'activer.", res);
});

// ============================================================
//  POST /api/auth/login — Connexion
// ============================================================
export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorHandler("Email et mot de passe requis.", 400));
  }

  // On sélectionne explicitement "password" (colonne sensible)
  const { rows } = await query(
    `SELECT *, ${PUBLIC_FIELDS} FROM users WHERE email = $1`,
    [email]
  );

  // Message générique pour ne pas révéler si l'email existe
  const WRONG = "Email ou mot de passe incorrect.";

  if (rows.length === 0) return next(new ErrorHandler(WRONG, 401));

  const user = rows[0];

  // Compte désactivé ?
  if (!user.is_active) {
    return next(new ErrorHandler("Votre compte est désactivé. Contactez le support.", 403));
  }

  // Compte verrouillé ? (trop de tentatives)
  if (user.lock_until && new Date(user.lock_until) > new Date()) {
    const mins = Math.ceil((new Date(user.lock_until) - Date.now()) / 60000);
    return next(new ErrorHandler(`Compte verrouillé. Réessayez dans ${mins} minute(s).`, 403));
  }

  // Vérification du mot de passe
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    // Incrémente les tentatives, verrouille après 5 échecs
    const attempts = user.login_attempts + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
    await query(
      "UPDATE users SET login_attempts = $1, lock_until = $2 WHERE id = $3",
      [attempts, lockUntil, user.id]
    );
    return next(new ErrorHandler(WRONG, 401));
  }

  // Connexion réussie : remise à zéro du compteur + mise à jour last_login
  await query(
    "UPDATE users SET login_attempts = 0, lock_until = NULL, last_login = NOW() WHERE id = $1",
    [user.id]
  );

  // Reconstruit l'objet user propre (sans password, sans tokens internes)
  const publicUser = (await query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [user.id])).rows[0];

  sendToken(publicUser, 200, "Connexion réussie ! Bienvenue.", res);
});

// ============================================================
//  POST /api/auth/logout — Déconnexion
// ============================================================
export const logout = catchAsyncErrors(async (req, res, next) => {
  // On écrase le cookie avec une date d'expiration passée
  res
    .status(200)
    .cookie("token", "", {
      expires:  new Date(Date.now()),
      httpOnly: true,
    })
    .json({
      success: true,
      message: "Déconnexion réussie.",
    });
});

// ============================================================
//  GET /api/auth/verify-email?token=xxx — Vérification email
// ============================================================
export const verifyEmail = catchAsyncErrors(async (req, res, next) => {
  const { token } = req.query;
  if (!token) return next(new ErrorHandler("Token manquant.", 400));

  const hashed = crypto.createHash("sha256").update(token).digest("hex");

  const { rows } = await query(
    `SELECT id, name, email FROM users
     WHERE email_verification_token = $1
       AND email_verification_expires > NOW()`,
    [hashed]
  );

  if (rows.length === 0) {
    return next(new ErrorHandler("Lien invalide ou expiré.", 400));
  }

  await query(
    `UPDATE users
     SET is_email_verified          = TRUE,
         email_verification_token   = NULL,
         email_verification_expires = NULL
     WHERE id = $1`,
    [rows[0].id]
  );

  sendWelcomeEmail(rows[0].email, rows[0].name)
    .catch((err) => console.error("Email bienvenue :", err.message));

  res.status(200).json({ success: true, message: "Email vérifié ! Votre compte est actif." });
});

// ============================================================
//  POST /api/auth/forgot-password — Mot de passe oublié
// ============================================================
export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;

  // Même réponse que l'email existe ou non (sécurité)
  const OK = "Si cet email existe, un lien de réinitialisation a été envoyé.";

  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  if (rows.length === 0) return res.status(200).json({ success: true, message: OK });

  const user = rows[0];

  const { raw, hashed }  = generateSecureToken();
  const expiresMin       = parseInt(process.env.RESET_TOKEN_EXPIRES) || 15;
  const expiresAt        = new Date(Date.now() + expiresMin * 60 * 1000);

  await query(
    "UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3",
    [hashed, expiresAt, user.id]
  );

  await query(
    "INSERT INTO password_reset_requests (user_id, ip_address) VALUES ($1, $2)",
    [user.id, req.ip]
  );

  await sendPasswordResetEmail(user.email, user.name, raw);

  res.status(200).json({ success: true, message: OK });
});

// ============================================================
//  POST /api/auth/reset-password?token=xxx — Nouveau mot de passe
// ============================================================
export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { token }    = req.query;
  const { password } = req.body;

  if (!token) return next(new ErrorHandler("Token manquant.", 400));

  const hashed = crypto.createHash("sha256").update(token).digest("hex");

  const { rows } = await query(
    `SELECT id FROM users
     WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
    [hashed]
  );

  if (rows.length === 0) {
    return next(new ErrorHandler("Lien invalide ou expiré.", 400));
  }

  const newHash = await bcrypt.hash(password, 12);

  await query(
    `UPDATE users
     SET password              = $1,
         password_reset_token  = NULL,
         password_reset_expires = NULL
     WHERE id = $2`,
    [newHash, rows[0].id]
  );

  res.status(200).json({ success: true, message: "Mot de passe réinitialisé. Veuillez vous reconnecter." });
});

// ============================================================
//  GET /api/auth/me — Profil de l'utilisateur connecté
// ============================================================
export const getMe = catchAsyncErrors(async (req, res, next) => {
  // req.user est injecté par le middleware protect
  const { rows } = await query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`,
    [req.user.id]
  );

  res.status(200).json({ success: true, user: rows[0] });
});

// ============================================================
//  PUT /api/auth/me — Modifier son profil
// ============================================================
export const updateMe = catchAsyncErrors(async (req, res, next) => {
  const { name, avatar } = req.body;

  const { rows } = await query(
    `UPDATE users
     SET name   = COALESCE($1, name),
         avatar = COALESCE($2, avatar)
     WHERE id = $3
     RETURNING ${PUBLIC_FIELDS}`,
    [name, avatar, req.user.id]
  );

  res.status(200).json({ success: true, message: "Profil mis à jour.", user: rows[0] });
});

// ============================================================
//  PUT /api/auth/change-password — Changer son mot de passe
// ============================================================
export const changePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  // Récupère le hash actuel
  const { rows } = await query("SELECT password FROM users WHERE id = $1", [req.user.id]);

  const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
  if (!isMatch) {
    return next(new ErrorHandler("Mot de passe actuel incorrect.", 401));
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await query("UPDATE users SET password = $1 WHERE id = $2", [newHash, req.user.id]);

  res.status(200).json({ success: true, message: "Mot de passe modifié. Veuillez vous reconnecter." });
});