import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import { sendToken } from "../utils/jwtToken.js";
import sendEmail from "../utils/sendEmail.js";
import { v2 as cloudinary } from "cloudinary";

// ═══════════════════════════════════════════════════════════
// REGISTER
// POST /api/auth/register
// Creates account + sends verification email
// ═══════════════════════════════════════════════════════════
export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password, phone, address, city } = req.body;

  if (!name || !email || !password)
    return next(new ErrorHandler("Veuillez fournir un nom, un email et un mot de passe.", 400));

  if (password.length < 6)
    return next(new ErrorHandler("Le mot de passe doit contenir au moins 6 caractères.", 400));

  const existingUser = await database.query(
    "SELECT id FROM users WHERE email = $1", [email]
  );
  if (existingUser.rows.length > 0)
    return next(new ErrorHandler("Cet email est déjà utilisé.", 409));

  // Upload avatar if provided
  let avatarUrl = null;
  if (req.files && req.files.avatar) {
    const result = await cloudinary.uploader.upload(
      req.files.avatar.tempFilePath,
      { folder: "Ecommerce_Avatars", width: 200, crop: "scale" }
    );
    avatarUrl = result.secure_url;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // ✅ FIX — token simple, pas de double hashing
  // rawToken sauvegardé directement en DB (pas le hash)
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const result = await database.query(
    `INSERT INTO users
      (name, email, password, avatar, role, is_verified, verification_token, phone, address, city)
     VALUES ($1, $2, $3, $4, 'user', false, $5, $6, $7, $8)
     RETURNING id, name, email, avatar, role, is_verified, verification_token, phone, address, city`,
    [name, email, hashedPassword, avatarUrl, verificationToken, phone || null, address || null, city || null]
  );

  const user = result.rows[0];

  // ✅ Log pour vérifier que le token est bien sauvegardé
  console.log("✅ Token saved in DB:", user.verification_token);

  // ✅ FIX — encodeURIComponent pour éviter les problèmes de caractères spéciaux dans l'URL
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${encodeURIComponent(verificationToken)}`;

  await sendEmail({
    to:      email,
    subject: "Verify your email — GOFFA",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome ${name} !</h2>
        <p>Please click the button below to verify your email address.</p>
        <a href="${verificationUrl}"
           style="background: #059669; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Verify my email
        </a>
        <p style="margin-top: 16px; color: #666;">
          This link expires in 24 hours.
        </p>
      </div>
    `,
  });

  res.status(201).json({
    success: true,
    message: `Account created. Please check ${email} to verify your account.`,
    user,
  });
});


// ═══════════════════════════════════════════════════════════
// VERIFY EMAIL
// GET /api/auth/verify-email/:token
// User clicks the link in their email
// ═══════════════════════════════════════════════════════════
export const verifyEmail = catchAsyncErrors(async (req, res, next) => {
  const { token } = req.params;

  // ✅ FIX — plus de hashing, on compare le token directement
  const result = await database.query(
    "SELECT * FROM users WHERE verification_token = $1", [token]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Lien de vérification invalide ou expiré.", 400));

  const user = result.rows[0];

  if (user.is_verified)
    return next(new ErrorHandler("Email déjà vérifié.", 400));

  const updatedResult = await database.query(
    `UPDATE users
     SET is_verified = true, verification_token = NULL
     WHERE id = $1
     RETURNING id, name, email, avatar, role, is_verified, created_at`,
    [user.id]
  );

  const updatedUser = updatedResult.rows[0];

  // Log them in directly after verification
  sendToken(updatedUser, 200, "Email verified successfully. You are now logged in.", res);
});


// ═══════════════════════════════════════════════════════════
// LOGIN
// POST /api/auth/login
// Blocks login if email not verified
// ═══════════════════════════════════════════════════════════
export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new ErrorHandler("Veuillez fournir un email et un mot de passe.", 400));

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Email ou mot de passe incorrect.", 401));

  const user = result.rows[0];

  if (!user.is_verified)
    return next(new ErrorHandler("Veuillez vérifier votre email avant de vous connecter.", 401));

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect)
    return next(new ErrorHandler("Email ou mot de passe incorrect.", 401));

  const { password: _, ...userWithoutPassword } = user;

  sendToken(userWithoutPassword, 200, "Logged in successfully.", res);
});


// ═══════════════════════════════════════════════════════════
// GOOGLE AUTH CALLBACK
// GET /api/auth/google/callback
// ═══════════════════════════════════════════════════════════
export const googleCallback = catchAsyncErrors(async (req, res, next) => {
  const user = req.user;

  if (!user)
    return next(new ErrorHandler("Authentification Google échouée.", 401));

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res
    .cookie("token", token, {
      expires:  new Date(Date.now() + process.env.COOKIES_EXPIRES_IN * 24 * 60 * 60 * 1000),
      httpOnly: true,
    })
    .redirect(`${process.env.FRONTEND_URL}/login/success`);
});


// ═══════════════════════════════════════════════════════════
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// ═══════════════════════════════════════════════════════════
export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;

  if (!email)
    return next(new ErrorHandler("Veuillez fournir votre email.", 400));

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  if (result.rows.length === 0) {
    return res.status(200).json({
      success: true,
      message: "Si cet email existe, un lien de réinitialisation a été envoyé.",
    });
  }

  const user = result.rows[0];

  const rawToken    = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expireTime  = new Date(Date.now() + 15 * 60 * 1000);

  await database.query(
    `UPDATE users
     SET reset_password_token=$1, reset_password_expire=$2
     WHERE id=$3`,
    [hashedToken, expireTime, user.id]
  );

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      email,
    subject: "Reset your password — GOFFA",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the button below :</p>
        <a href="${resetUrl}"
           style="background: #059669; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Reset my password
        </a>
        <p style="margin-top: 16px; color: #666;">
          This link expires in <strong>15 minutes</strong>.
          If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  });

  res.status(200).json({
    success: true,
    message: "If this email exists, a reset link has been sent.",
  });
});


// ═══════════════════════════════════════════════════════════
// RESET PASSWORD
// POST /api/auth/reset-password/:token
// ═══════════════════════════════════════════════════════════
export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { token }    = req.params;
  const { password } = req.body;

  if (!password)
    return next(new ErrorHandler("Veuillez fournir un nouveau mot de passe.", 400));

  if (password.length < 6)
    return next(new ErrorHandler("Le mot de passe doit contenir au moins 6 caractères.", 400));

  const hashedToken = crypto.createHash("sha256").update(decodeURIComponent(token)).digest("hex");

  const result = await database.query(
    `SELECT * FROM users
     WHERE reset_password_token = $1
     AND reset_password_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Lien de réinitialisation invalide ou expiré.", 400));

  const user = result.rows[0];

  const hashedPassword = await bcrypt.hash(password, 10);

  await database.query(
    `UPDATE users
     SET password=$1, reset_password_token=NULL, reset_password_expire=NULL
     WHERE id=$2`,
    [hashedPassword, user.id]
  );

  res.status(200).json({
    success: true,
    message: "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.",
  });
});


// ═══════════════════════════════════════════════════════════
// LOGOUT
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════
export const logout = catchAsyncErrors(async (req, res, next) => {
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


// ═══════════════════════════════════════════════════════════
// GET MY PROFILE
// GET /api/auth/me
// ═══════════════════════════════════════════════════════════
export const getMe = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT id, name, email, avatar, role, is_verified, phone, address, city, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Utilisateur introuvable.", 404));

  res.status(200).json({
    success: true,
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PROFILE
// PUT /api/auth/me
// ═══════════════════════════════════════════════════════════
export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const { name, phone, address, city } = req.body;

  const user = await database.query(
    "SELECT * FROM users WHERE id = $1", [req.user.id]
  );

  let avatarUrl = user.rows[0].avatar;
  if (req.files && req.files.avatar) {
    if (avatarUrl) {
      const matches = avatarUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      if (matches) await cloudinary.uploader.destroy(matches[1]);
    }
    const result = await cloudinary.uploader.upload(
      req.files.avatar.tempFilePath,
      { folder: "Ecommerce_Avatars", width: 200, crop: "scale" }
    );
    avatarUrl = result.secure_url;
  }

  const result = await database.query(
    `UPDATE users SET name=$1, avatar=$2, phone=$3, address=$4, city=$5
     WHERE id=$6
     RETURNING id, name, email, avatar, role, is_verified, phone, address, city, created_at`,
    [
      name    || user.rows[0].name,
      avatarUrl,
      phone   ?? user.rows[0].phone,
      address ?? user.rows[0].address,
      city    ?? user.rows[0].city,
      req.user.id
    ]
  );

  res.status(200).json({
    success: true,
    message: "Profil mis à jour avec succès.",
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PASSWORD
// PUT /api/auth/password
// ═══════════════════════════════════════════════════════════
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return next(new ErrorHandler("Veuillez fournir le mot de passe actuel et le nouveau.", 400));

  if (newPassword.length < 6)
    return next(new ErrorHandler("Le nouveau mot de passe doit contenir au moins 6 caractères.", 400));

  const result = await database.query(
    "SELECT * FROM users WHERE id = $1", [req.user.id]
  );
  const user = result.rows[0];

  const isCorrect = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrect)
    return next(new ErrorHandler("Le mot de passe actuel est incorrect.", 401));

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await database.query(
    "UPDATE users SET password=$1 WHERE id=$2",
    [hashedPassword, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: "Mot de passe modifié avec succès.",
  });
});