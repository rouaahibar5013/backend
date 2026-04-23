import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail from "../utils/sendEmail.js";
import { linkSubscriptionToUserService } from "./emailcampaignService.js";

// ═══════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════
export const registerUser = async ({ name, email, password, phone, address, city, avatarFile }) => {
  const existingUser = await database.query(
    "SELECT id FROM users WHERE email = $1", [email]
  );
  if (existingUser.rows.length > 0)
    throw new ErrorHandler("Cet email est déjà utilisé.", 409);

  let avatarUrl = null;
  if (avatarFile) {
    const result = await cloudinary.uploader.upload(
      avatarFile.tempFilePath,
      { folder: "Ecommerce_Avatars", width: 200, crop: "scale" }
    );
    avatarUrl = result.secure_url;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // ✅ rawToken dans l'email, hashedToken en DB
  const rawToken          = crypto.randomBytes(32).toString("hex");
  const verificationToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const verificationExpire = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const result = await database.query(
    `INSERT INTO users
      (name, email, password, avatar, role, is_verified, verification_token, verification_token_expire, phone, address, city)
    VALUES ($1, $2, $3, $4, 'user', false, $5, $6, $7, $8, $9)
    RETURNING id, name, email, avatar, role, is_verified, phone, address, city`,
    [name, email, hashedPassword, avatarUrl, verificationToken, verificationExpire,
    phone || null, address || null, city || null]
  );

  const user = result.rows[0];

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      email,
    subject: "Vérifiez votre email — GOFFA 🧺",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2>Bienvenue ${name} !</h2>
          <p>Cliquez sur le bouton ci-dessous pour vérifier votre adresse email.</p>
          <a href="${verificationUrl}"
             style="background: #166534; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">
            Vérifier mon email →
          </a>
          <p style="color: #666; font-size: 14px;">Ce lien expire dans <strong>24 heures</strong>.</p>
        </div>
      </div>
    `,
  });
 // ✅ Relier l'abonnement newsletter si email déjà inscrit anonymement
  await linkSubscriptionToUserService({ userId: user.id, email });

  return user;
};


// ═══════════════════════════════════════════════════════════
// VERIFY EMAIL
// ═══════════════════════════════════════════════════════════
export const verifyUserEmail = async (token) => {
  const hashedToken = crypto
  .createHash("sha256")
  .update(token)
  .digest("hex");

  const result = await database.query(
    `SELECT * FROM users 
    WHERE verification_token = $1 
    AND verification_token_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Lien de vérification invalide ou expiré.", 400);

  const user = result.rows[0];

  if (user.is_verified)
    throw new ErrorHandler("Email déjà vérifié.", 400);

  const updatedResult = await database.query(
    `UPDATE users
     SET is_verified = true, verification_token = NULL
     WHERE id = $1
     RETURNING id, name, email, avatar, role, is_verified, created_at`,
    [user.id]
  );

  return updatedResult.rows[0];
};


// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
export const loginUser = async ({ email, password }) => {
  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Email ou mot de passe incorrect.", 401);

  const user = result.rows[0];

  if (user.is_active === false)
    throw new ErrorHandler("Votre compte a été suspendu. Contactez le support.", 403);

  // ✅ Guest users (sans password) ne peuvent pas se connecter par email/password

// ✅ Nouveau
if (!user.password) {
  if (user.google_id) {
    throw new ErrorHandler(
      "Ce compte utilise la connexion Google. Cliquez sur 'Se connecter avec Google'.", 401
    );
  }
  throw new ErrorHandler(
    "Veuillez compléter votre compte via le lien reçu par email.", 401
  );
}

  if (!user.is_verified)
    throw new ErrorHandler("Veuillez vérifier votre email avant de vous connecter.", 401);

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect)
    throw new ErrorHandler("Email ou mot de passe incorrect.", 401);

  const { password: _, ...userWithoutPassword } = user;
  await linkSubscriptionToUserService({ userId: user.id, email });

  return userWithoutPassword;
};


// ═══════════════════════════════════════════════════════════
// GOOGLE CALLBACK
// ═══════════════════════════════════════════════════════════
export const googleCallbackToken = (user) => {
  if (!user)
    throw new ErrorHandler("Authentification Google échouée.", 401);

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  return token;
};


// ═══════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════
export const forgotUserPassword = async (email) => {
  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  if (result.rows.length === 0) return false;

  const user = result.rows[0];

  const rawToken    = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expireTime  = new Date(Date.now() + 15 * 60 * 1000);

  await database.query(
    `UPDATE users SET reset_password_token=$1, reset_password_expire=$2 WHERE id=$3`,
    [hashedToken, expireTime, user.id]
  );

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      email,
    subject: "Réinitialisation de mot de passe — GOFFA 🧺",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2>Réinitialisation de mot de passe</h2>
          <p>Cliquez sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
          <a href="${resetUrl}"
             style="background: #166534; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">
            Réinitialiser mon mot de passe →
          </a>
          <p style="color: #666; font-size: 14px;">
            Ce lien expire dans <strong>15 minutes</strong>.
            Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
          </p>
        </div>
      </div>
    `,
  });

  return true;
};


// ═══════════════════════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════════════════════
export const resetUserPassword = async ({ token, password }) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const result = await database.query(
    `SELECT * FROM users
     WHERE reset_password_token = $1
     AND reset_password_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Lien de réinitialisation invalide ou expiré.", 400);

  const user = result.rows[0];
  const hashedPassword = await bcrypt.hash(password, 10);

  await database.query(
    `UPDATE users
     SET password=$1, reset_password_token=NULL, reset_password_expire=NULL
     WHERE id=$2`,
    [hashedPassword, user.id]
  );

  return true;
};


// ═══════════════════════════════════════════════════════════
// GET USER BY ID
// ═══════════════════════════════════════════════════════════
export const getUserById = async (id) => {
  const result = await database.query(
    `SELECT id, name, email, avatar, role, is_verified, phone, address, city, created_at
     FROM users WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// UPDATE PROFILE
// ═══════════════════════════════════════════════════════════
export const updateUserProfile = async ({ userId, name, phone, address, city, avatarFile, deleteAvatar  }) => {
  const userResult = await database.query(
    "SELECT * FROM users WHERE id = $1", [userId]
  );
  const currentUser = userResult.rows[0];

  let avatarUrl = currentUser.avatar;


  // ✅ Suppression de l'avatar
  if (deleteAvatar === 'true' || deleteAvatar === true) {
    if (currentUser.avatar) {
      // Supprimer de Cloudinary
      const matches = currentUser.avatar.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      if (matches) {
        await cloudinary.uploader.destroy(matches[1]).catch(err =>
          console.error("Cloudinary delete error:", err.message)
        );
      }
    }
    avatarUrl = null; // ← avatar = null en DB → photo par défaut
  }



  if (avatarFile) {
   if (currentUser.avatar) {
      const matches =currentUser.avatar.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      if (matches) await cloudinary.uploader.destroy(matches[1]);
    }
    const result = await cloudinary.uploader.upload(
      avatarFile.tempFilePath,
      { folder: "Ecommerce_Avatars", width: 200, crop: "scale" }
    );
    avatarUrl = result.secure_url;
  }

  const result = await database.query(
    `UPDATE users SET name=$1, avatar=$2, phone=$3, address=$4, city=$5
     WHERE id=$6
     RETURNING id, name, email, avatar, role, is_verified, phone, address, city, created_at`,
    [
      name    || currentUser.name,
      avatarUrl,
      phone   ?? currentUser.phone,
      address ?? currentUser.address,
      city    ?? currentUser.city,
      userId,
    ]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// UPDATE PASSWORD
// ═══════════════════════════════════════════════════════════
export const updateUserPassword = async ({ userId, currentPassword, newPassword }) => {
  const result = await database.query(
    "SELECT * FROM users WHERE id = $1", [userId]
  );
  const user = result.rows[0];

  const isCorrect = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrect)
    throw new ErrorHandler("Le mot de passe actuel est incorrect.", 401);

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await database.query(
    "UPDATE users SET password=$1 WHERE id=$2",
    [hashedPassword, userId]
  );

  return true;
};


// ═══════════════════════════════════════════════════════════
// CREATE GUEST ACCOUNT SERVICE
// Appelé automatiquement quand un guest passe une commande
// ═══════════════════════════════════════════════════════════
export const createGuestAccountService = async ({ name, email, phone, shipping_address, shipping_city }) => {
  // User existe déjà → retourner son compte
  const existingUser = await database.query(
    "SELECT * FROM users WHERE email=$1", [email]
  );
  if (existingUser.rows.length > 0)
    return existingUser.rows[0];

  // ✅ Créer compte guest avec token pour compléter le compte
  const rawToken             = crypto.randomBytes(32).toString("hex");
  const completeAccountToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expireTime           = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

  const newUser = await database.query(
    `INSERT INTO users
      (name, email, phone, address, city, role, is_verified,
       complete_account_token, complete_account_expire)
     VALUES ($1, $2, $3, $4, $5, 'user', false, $6, $7)
     RETURNING *`,
    [name, email, phone || null, shipping_address, shipping_city,
     completeAccountToken, expireTime]
  );

  const user = newUser.rows[0];

  // ✅ Email pour compléter le compte (pas de vérification email)
  const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      email,
    subject: "Complétez votre compte — GOFFA 🧺",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2>Bienvenue ${name} ! 🎉</h2>
          <p>Votre commande a été passée avec succès.</p>
          <p>Nous avons créé un compte pour vous. Cliquez ci-dessous pour définir votre mot de passe
             et accéder à votre historique de commandes :</p>
          <a href="${completeUrl}"
             style="background: #166534; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">
            Créer mon mot de passe →
          </a>
          <p style="color: #666; font-size: 14px;">Ce lien expire dans <strong>7 jours</strong>.</p>
        </div>
      </div>
    `,
  });

  return user;
};


// ═══════════════════════════════════════════════════════════
// COMPLETE ACCOUNT
// Guest définit son mot de passe après commande
// ═══════════════════════════════════════════════════════════
export const completeUserAccount = async ({ token, password }) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const result = await database.query(
    `SELECT * FROM users
     WHERE complete_account_token=$1
     AND complete_account_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Lien invalide ou expiré.", 400);

  const user = result.rows[0];
  const hashedPassword = await bcrypt.hash(password, 10);

  const updatedUser = await database.query(
    `UPDATE users
     SET password=$1, is_verified=true,
         complete_account_token=NULL, complete_account_expire=NULL
     WHERE id=$2
     RETURNING id, name, email, avatar, role, is_verified, phone, address, city, created_at`,
    [hashedPassword, user.id]
  );
 await linkSubscriptionToUserService({ userId: user.id, email: user.email });
  return updatedUser.rows[0];
};



// ═══════════════════════════════════════════════════════════
// ADMIN UPDATE USER
// PUT /api/auth/users/:userId
// Admin peut modifier toutes les infos d'un user
// ═══════════════════════════════════════════════════════════

export const adminUpdateUserService = async ({
  userId,
  name, email, phone, address, city,
  role, is_verified, is_active, newPassword
}) => {

  // Vérifier que le user existe
  const userResult = await database.query(
    "SELECT * FROM users WHERE id=$1", [userId]
  );
  if (userResult.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  const current = userResult.rows[0];

  // Vérifier email unique
  if (email && email !== current.email) {
    const emailExists = await database.query(
      "SELECT id FROM users WHERE email=$1 AND id!=$2", [email, userId]
    );
    if (emailExists.rows.length > 0)
      throw new ErrorHandler("Cet email est déjà utilisé.", 409);
  }

  // Valider rôle
  if (role && !['user', 'admin'].includes(role))
    throw new ErrorHandler("Rôle invalide.", 400);

  // hasher le nouveau Password
  let hashedPassword = current.password;
  if (newPassword) {
    if (newPassword.length < 6)
      throw new ErrorHandler("Le mot de passe doit contenir au moins 6 caractères.", 400);
    hashedPassword = await bcrypt.hash(newPassword, 10);
  }

  const result = await database.query(
    `UPDATE users
     SET name=$1, email=$2, phone=$3, address=$4, city=$5,
         role=$6, is_verified=$7, is_active=$8, password=$9
     WHERE id=$10
     RETURNING id, name, email, avatar, role, is_verified,
               is_active, phone, address, city, created_at`,
    [
      name        || current.name,
      email       || current.email,
      phone       ?? current.phone,
      address     ?? current.address,
      city        ?? current.city,
      role        || current.role,
      is_verified ?? current.is_verified,
      is_active   ?? current.is_active,
      hashedPassword,
      userId,
    ]
  );

  return result.rows[0];
};
