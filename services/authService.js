import bcrypt        from "bcryptjs";
import crypto        from "crypto";
import jwt           from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import { User }      from "../models/index.js";
import ErrorHandler  from "../middlewares/errorMiddleware.js";
import sendEmail     from "../utils/sendEmail.js";
import { linkSubscriptionToUserService } from "./emailcampaignService.js";
import { checkLoginBlock, recordFailedLogin, clearLoginAttempts } from "../utils/loginAttempts.js";
import { invalidateDashboardCache } from "../utils/cacheInvalideation.js";
import { notifyUser } from "../utils/websocket.js";


// ══════════════════════════════════════════════════════════════════════════
// HELPERS INTERNES
// ══════════════════════════════════════════════════════════════════════════

export const validatePassword = (password) => {
  if (!password || typeof password !== "string")
    throw new ErrorHandler("Le mot de passe est requis.", 400);

  const errors = [];
  if (password.length < 10)               errors.push("au moins 10 caractères");
  if (!/[a-z]/.test(password))            errors.push("une lettre minuscule");
  if (!/[A-Z]/.test(password))            errors.push("une lettre majuscule");
  if (!/[0-9]/.test(password))            errors.push("un chiffre");
  if (!/[!@#$%^&*()\-_=+\[\]{};':",.<>/?`~\\|]/.test(password))
    errors.push("un caractère spécial (!@#$%^&*…)");

  if (errors.length > 0)
    throw new ErrorHandler(`Le mot de passe doit contenir : ${errors.join(", ")}.`, 400);
};

export const validateEmail = (email) => {
  if (!email || typeof email !== "string")
    throw new ErrorHandler("L'email est requis.", 400);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email.trim()))
    throw new ErrorHandler("Format d'email invalide.", 400);
};

const generateTokenPair = () => {
  const rawToken    = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, hashedToken };
};

const destroyCloudinaryAvatar = async (url) => {
  if (!url) return;
  const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  if (matches) {
    await cloudinary.uploader.destroy(matches[1]).catch((err) =>
      console.error("[Cloudinary] delete error:", err.message)
    );
  }
};

const wrapEmail = (bodyHtml) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#166534;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
      <h1 style="color:white;margin:0;">🧺 GOFFA</h1>
      <p style="color:#86efac;margin:5px 0 0;">artisanat</p>
    </div>
    <div style="padding:30px;background:#f9fafb;border-radius:0 0 10px 10px;">
      ${bodyHtml}
    </div>
  </div>`;

const ctaButton = (url, label) =>
  `<a href="${url}"
      style="background:#166534;color:white;padding:12px 24px;
             text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
     ${label}
   </a>`;


// ══════════════════════════════════════════════════════════════════════════
// REGISTER
// ══════════════════════════════════════════════════════════════════════════
export const registerUser = async ({
  name, email, password, phone, address, city, avatarFile,
}) => {
  validateEmail(email);
  validatePassword(password);

  if (!name || name.trim().length < 2)
    throw new ErrorHandler("Le nom doit contenir au moins 2 caractères.", 400);

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findByEmail(normalizedEmail);
  if (existingUser) {
    if (existingUser.google_id)
      throw new ErrorHandler("Ce compte utilise la connexion Google. Cliquez sur 'Se connecter avec Google'.", 409);
    throw new ErrorHandler("Cet email est déjà utilisé.", 409);
  }

  let avatarUrl = null;
  if (avatarFile) {
    const result = await cloudinary.uploader.upload(avatarFile.tempFilePath, {
      folder: "Ecommerce_Avatars", width: 200, crop: "scale",
    });
    avatarUrl = result.secure_url;
  }

  const hashedPassword                = await bcrypt.hash(password, 12);
  const { rawToken, hashedToken }     = generateTokenPair();
  const verificationExpire            = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await User.createWithVerification({
    name: name.trim(), email: normalizedEmail, password: hashedPassword,
    avatarUrl, verificationToken: hashedToken, verificationExpire,
    phone, address, city,
  });

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to: normalizedEmail, subject: "Vérifiez votre email — GOFFA 🧺",
    html: wrapEmail(`
      <h2>Bienvenue ${name.trim()} !</h2>
      <p>Merci de vous être inscrit sur GOFFA. Cliquez sur le bouton ci-dessous
         pour activer votre compte.</p>
      ${ctaButton(verificationUrl, "Vérifier mon email →")}
      <p style="color:#666;font-size:14px;">
        Ce lien expire dans <strong>24 heures</strong>.<br/>
        Si vous n'avez pas créé de compte, ignorez cet email.
      </p>
    `),
  });

  await linkSubscriptionToUserService({ userId: user.id, email: normalizedEmail });
  await invalidateDashboardCache();
  return user;
};


// ══════════════════════════════════════════════════════════════════════════
// RESEND VERIFICATION EMAIL
// ══════════════════════════════════════════════════════════════════════════
export const resendVerificationEmailService = async (email) => {
  validateEmail(email);
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findByEmail(normalizedEmail);
  if (!user) return true;

  if (user.is_verified)
    throw new ErrorHandler("Ce compte est déjà vérifié. Connectez-vous.", 400);

  const { rawToken, hashedToken } = generateTokenPair();
  const expire                    = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await User.updateVerificationToken(user.id, hashedToken, expire);

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to: normalizedEmail, subject: "Nouveau lien de vérification — GOFFA 🧺",
    html: wrapEmail(`
      <h2>Renvoi du lien de vérification</h2>
      <p>Voici un nouveau lien pour activer votre compte :</p>
      ${ctaButton(verificationUrl, "Vérifier mon email →")}
      <p style="color:#666;font-size:14px;">Ce lien expire dans <strong>24 heures</strong>.</p>
    `),
  });

  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// VERIFY EMAIL
// ══════════════════════════════════════════════════════════════════════════
export const verifyUserEmail = async (token) => {
  if (!token) throw new ErrorHandler("Token manquant.", 400);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findByVerificationToken(hashedToken);
  if (!user)
    throw new ErrorHandler("Lien de vérification invalide ou expiré.", 400);

  if (user.is_verified)
    throw new ErrorHandler("Email déjà vérifié. Vous pouvez vous connecter.", 400);

  return await User.verify(user.id);
};


// ══════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════
export const loginUser = async ({ email, password, ip }) => {
  validateEmail(email);
  if (!password) throw new ErrorHandler("Le mot de passe est requis.", 400);

  const normalizedEmail = email.trim().toLowerCase();
  const user            = await User.findByEmail(normalizedEmail);

  if (!user)
    throw new ErrorHandler("Email ou mot de passe incorrect.", 401);

  if (user.is_active === false)
    throw new ErrorHandler("Votre compte a été suspendu. Contactez le support.", 403);

  if (!user.password) {
    if (user.google_id)
      throw new ErrorHandler("Ce compte utilise la connexion Google. Cliquez sur 'Se connecter avec Google'.", 401);
    throw new ErrorHandler("Veuillez compléter votre compte via le lien reçu par email.", 401);
  }

  if (!user.is_verified)
    throw new ErrorHandler("Veuillez vérifier votre email avant de vous connecter.", 401);

  try {
    await checkLoginBlock(user.id, ip);
  } catch (err) {
    if (err.message.startsWith("BLOCKED:")) {
      const minutes = err.message.split(":")[1];
      throw new ErrorHandler(
        `Compte temporairement bloqué après trop d'échecs. Réessayez dans ${minutes} minute(s).`, 429
      );
    }
    throw err;
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    await recordFailedLogin(user.id, ip);
    throw new ErrorHandler("Email ou mot de passe incorrect.", 401);
  }

  await clearLoginAttempts(user.id, ip);

  const otp       = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHashed = crypto.createHash("sha256").update(otp).digest("hex");
  const otpExpire = new Date(Date.now() + 10 * 60 * 1000);

  await User.setMfaOtp(user.id, otpHashed, otpExpire);

  await sendEmail({
    to: normalizedEmail, subject: "Votre code de connexion — GOFFA 🧺",
    html: wrapEmail(`
      <h2>Code de vérification</h2>
      <p>Bonjour ${user.name},</p>
      <p>Voici votre code de connexion à usage unique :</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:12px;
                  text-align:center;color:#166534;margin:24px 0;">
        ${otp}
      </div>
      <p style="color:#666;font-size:14px;">
        Ce code expire dans <strong>10 minutes</strong>.<br/>
        Si vous n'avez pas tenté de vous connecter, ignorez cet email.
      </p>
    `),
  });

  const mfaSessionToken = jwt.sign(
    { userId: user.id }, process.env.JWT_SECRET, { expiresIn: "10m" }
  );
  return { mfaRequired: true, mfaSessionToken };
};


// ══════════════════════════════════════════════════════════════════════════
// VERIFY MFA OTP
// ══════════════════════════════════════════════════════════════════════════
export const verifyMfaService = async ({ mfaSessionToken, otp }) => {
  if (!mfaSessionToken || !otp)
    throw new ErrorHandler("mfaSessionToken et otp sont requis.", 400);

  let userId;
  try {
    const decoded = jwt.verify(mfaSessionToken, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch {
    throw new ErrorHandler("Session MFA expirée. Recommencez la connexion.", 401);
  }

  const user = await User.findWithValidMfa(userId);
  if (!user)
    throw new ErrorHandler("Code invalide ou expiré. Recommencez la connexion.", 401);

  const otpHashed = crypto.createHash("sha256").update(otp).digest("hex");
  if (otpHashed !== user.mfa_otp)
    throw new ErrorHandler("Code incorrect.", 401);

  await User.clearMfaOtp(userId);
  await linkSubscriptionToUserService({ userId: user.id, email: user.email });

  const { password: _, mfa_otp: __, mfa_otp_expire: ___, ...userClean } = user;
  return userClean;
};


// ══════════════════════════════════════════════════════════════════════════
// GOOGLE CALLBACK
// ══════════════════════════════════════════════════════════════════════════
export const googleCallbackToken = (user) => {
  if (!user) throw new ErrorHandler("Authentification Google échouée.", 401);

  return jwt.sign(
    { id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};


// ══════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ══════════════════════════════════════════════════════════════════════════
export const forgotUserPassword = async (email) => {
  validateEmail(email);
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findByEmail(normalizedEmail);
  if (!user) return true;
  if (!user.password && user.google_id) return true;

  const { rawToken, hashedToken } = generateTokenPair();
  const expireTime                = new Date(Date.now() + 15 * 60 * 1000);

  await User.setResetToken(user.id, hashedToken, expireTime);

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to: normalizedEmail, subject: "Réinitialisation de mot de passe — GOFFA 🧺",
    html: wrapEmail(`
      <h2>Réinitialisation de mot de passe</h2>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      ${ctaButton(resetUrl, "Réinitialiser mon mot de passe →")}
      <p style="color:#666;font-size:14px;">
        Ce lien expire dans <strong>15 minutes</strong>.<br/>
        Si vous n'avez pas fait cette demande, ignorez cet email —
        votre mot de passe restera inchangé.
      </p>
    `),
  });

  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// RESET PASSWORD
// ══════════════════════════════════════════════════════════════════════════
export const resetUserPassword = async ({ token, password }) => {
  if (!token) throw new ErrorHandler("Token manquant.", 400);

  validatePassword(password);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user        = await User.findByResetToken(hashedToken);

  if (!user)
    throw new ErrorHandler("Lien de réinitialisation invalide ou expiré.", 400);

  if (user.password) {
    const isSame = await bcrypt.compare(password, user.password);
    if (isSame)
      throw new ErrorHandler("Le nouveau mot de passe doit être différent de l'ancien.", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await User.updatePassword(user.id, hashedPassword);
  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// GET USER BY ID
// ══════════════════════════════════════════════════════════════════════════
export const getUserById = async (id) => {
  const user = await User.findProfile(id);
  if (!user) throw new ErrorHandler("Utilisateur introuvable.", 404);
  return user;
};


// ══════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE
// ══════════════════════════════════════════════════════════════════════════
export const updateUserProfile = async ({
  userId, name, phone, address, city, avatarFile, deleteAvatar,
}) => {
  const cu = await User.findById(userId);
  if (!cu) throw new ErrorHandler("Utilisateur introuvable.", 404);

  let avatarUrl = cu.avatar;

  if (deleteAvatar === "true" || deleteAvatar === true) {
    await destroyCloudinaryAvatar(cu.avatar);
    avatarUrl = null;
  }

  if (avatarFile) {
    await destroyCloudinaryAvatar(cu.avatar);
    const upload = await cloudinary.uploader.upload(avatarFile.tempFilePath, {
      folder: "Ecommerce_Avatars", width: 200, crop: "scale",
    });
    avatarUrl = upload.secure_url;
  }

  const newPhone   = phone   ?? cu.phone;
  const newAddress = address ?? cu.address;
  const newCity    = city    ?? cu.city;

  const newBillingPhone   = phone   !== undefined ? newPhone   : cu.billing_phone;
  const newBillingAddress = address !== undefined ? newAddress : cu.billing_address;
  const newBillingCity    = city    !== undefined ? newCity    : cu.billing_city;

  return await User.updateProfile(userId, {
    name:           name?.trim() || cu.name,
    avatarUrl,
    phone:          newPhone,
    address:        newAddress,
    city:           newCity,
    billingPhone:   newBillingPhone,
    billingAddress: newBillingAddress,
    billingCity:    newBillingCity,
  });
};


// ══════════════════════════════════════════════════════════════════════════
// UPDATE PASSWORD
// ══════════════════════════════════════════════════════════════════════════
export const updateUserPassword = async ({ userId, currentPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorHandler("Utilisateur introuvable.", 404);

  if (!user.password) {
    if (user.google_id)
      throw new ErrorHandler("Ce compte utilise Google. Vous ne pouvez pas modifier de mot de passe ici.", 400);
    throw new ErrorHandler("Veuillez d'abord compléter votre compte via le lien reçu par email.", 400);
  }

  const isCorrect = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrect)
    throw new ErrorHandler("Le mot de passe actuel est incorrect.", 401);

  validatePassword(newPassword);

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame)
    throw new ErrorHandler("Le nouveau mot de passe doit être différent de l'ancien.", 400);

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await User.setPassword(userId, hashedPassword);
  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// CREATE GUEST ACCOUNT
// ══════════════════════════════════════════════════════════════════════════
export const createGuestAccountService = async ({
  name, email, phone, shipping_address, shipping_city,
}) => {
  validateEmail(email);
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findByEmail(normalizedEmail);

  if (existingUser) {
    if (existingUser.password) return existingUser;

    const { rawToken, hashedToken } = generateTokenPair();
    const expireTime                = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await User.setCompleteAccountToken(existingUser.id, hashedToken, expireTime);

    const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${encodeURIComponent(rawToken)}`;
    await sendEmail({
      to: normalizedEmail, subject: "Votre lien pour créer votre mot de passe — GOFFA 🧺",
      html: wrapEmail(`
        <h2>Bonjour ${existingUser.name} !</h2>
        <p>Une nouvelle commande a été passée. Voici un nouveau lien pour créer votre mot de passe :</p>
        ${ctaButton(completeUrl, "Créer mon mot de passe →")}
        <p style="color:#666;font-size:14px;">Ce lien expire dans <strong>7 jours</strong>.</p>
      `),
    });

    return existingUser;
  }

  const { rawToken, hashedToken } = generateTokenPair();
  const expireTime                = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user = await User.createGuest({
    name: name.trim(), email: normalizedEmail, phone,
    shipping_address, shipping_city,
    completeAccountToken: hashedToken, completeAccountExpire: expireTime,
  });

  const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to: normalizedEmail, subject: "Complétez votre compte — GOFFA 🧺",
    html: wrapEmail(`
      <h2>Bienvenue ${name.trim()} ! 🎉</h2>
      <p>Votre commande a été passée avec succès.</p>
      <p>Nous avons créé un compte pour vous. Cliquez ci-dessous pour définir votre mot de passe
         et accéder à votre historique de commandes :</p>
      ${ctaButton(completeUrl, "Créer mon mot de passe →")}
      <p style="color:#666;font-size:14px;">Ce lien expire dans <strong>7 jours</strong>.</p>
    `),
  });

  return user;
};


// ══════════════════════════════════════════════════════════════════════════
// COMPLETE ACCOUNT
// ══════════════════════════════════════════════════════════════════════════
export const completeUserAccount = async ({ token, password }) => {
  if (!token) throw new ErrorHandler("Token manquant.", 400);

  validatePassword(password);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user        = await User.findByCompleteAccountToken(hashedToken);

  if (!user) throw new ErrorHandler("Lien invalide ou expiré.", 400);

  const hashedPassword = await bcrypt.hash(password, 12);
  const updated        = await User.completeAccount(user.id, hashedPassword);

  await linkSubscriptionToUserService({ userId: user.id, email: user.email });
  return updated;
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — GET ALL USERS
// ══════════════════════════════════════════════════════════════════════════
export const getAllUsersService = async ({ page = 1, limit = 20, search = "", role = "", status = "" }) => {
  return await User.findAllAdmin({ page, limit, search, role, status });
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — DELETE USER
// ══════════════════════════════════════════════════════════════════════════
export const deleteUserService = async ({ userId, requestingAdminId }) => {
  if (userId === requestingAdminId)
    throw new ErrorHandler("Vous ne pouvez pas supprimer votre propre compte.", 400);

  const user = await User.findById(userId);
  if (!user) throw new ErrorHandler("Utilisateur introuvable.", 404);

  if (user.role === "admin")
    throw new ErrorHandler("Impossible de supprimer un administrateur. Révoquez son rôle d'abord.", 403);

  await User.delete(userId);
  await invalidateDashboardCache();
  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — UPDATE USER ROLE
// ══════════════════════════════════════════════════════════════════════════
export const updateUserRoleService = async ({ userId, role, requestingAdminId }) => {
  if (!["user", "admin"].includes(role))
    throw new ErrorHandler("Rôle invalide. Valeurs acceptées : 'user', 'admin'.", 400);

  if (userId === requestingAdminId)
    throw new ErrorHandler("Vous ne pouvez pas modifier votre propre rôle.", 400);

  const updated = await User.updateRole(userId, role);
  if (!updated) throw new ErrorHandler("Utilisateur introuvable.", 404);
  return updated;
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — SUSPEND / ACTIVATE USER
// ══════════════════════════════════════════════════════════════════════════
export const suspendUserService = async ({ userId, requestingAdminId }) => {
  if (userId === requestingAdminId)
    throw new ErrorHandler("Vous ne pouvez pas suspendre votre propre compte.", 400);

  const updated = await User.setActive(userId, false);
  if (!updated) throw new ErrorHandler("Utilisateur introuvable.", 404);

  await invalidateDashboardCache();
  notifyUser(userId, {
    type:    "ACCOUNT_SUSPENDED",
    message: "Votre compte a été suspendu. Contactez le support.",
    userId:  String(userId),
  });
  return updated;
};

export const activateUserService = async (userId) => {
  const updated = await User.setActive(userId, true);
  if (!updated) throw new ErrorHandler("Utilisateur introuvable.", 404);
  await invalidateDashboardCache();
  return updated;
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — UPDATE USER (toutes infos)
// ══════════════════════════════════════════════════════════════════════════
export const adminUpdateUserService = async ({
  userId, requestingAdminId,
  name, email, phone, address, city,
  role, is_verified, is_active, newPassword,
}) => {
  const current = await User.findById(userId);
  if (!current) throw new ErrorHandler("Utilisateur introuvable.", 404);

  if (email && email.trim().toLowerCase() !== current.email) {
    validateEmail(email);
    const emailExists = await User.findByEmailExcludingId(email.trim().toLowerCase(), userId);
    if (emailExists) throw new ErrorHandler("Cet email est déjà utilisé.", 409);
  }

  if (role && !["user", "admin"].includes(role))
    throw new ErrorHandler("Rôle invalide.", 400);

  if (userId === requestingAdminId && role && role !== "admin")
    throw new ErrorHandler("Vous ne pouvez pas modifier votre propre rôle.", 400);

  let hashedPassword = current.password;
  if (newPassword) {
    validatePassword(newPassword);
    hashedPassword = await bcrypt.hash(newPassword, 12);
  }

  const updated = await User.adminUpdate(userId, {
    name:          name?.trim()                        || current.name,
    email:         email ? email.trim().toLowerCase()  : current.email,
    phone:         phone         ?? current.phone,
    address:       address       ?? current.address,
    city:          city          ?? current.city,
    role:          role          || current.role,
    is_verified:   is_verified   ?? current.is_verified,
    is_active:     is_active     ?? current.is_active,
    hashedPassword,
  });

  const newIsActive = is_active ?? current.is_active;
  if (newIsActive !== current.is_active) {
    if (newIsActive === false) {
      notifyUser(userId, {
        type:    "ACCOUNT_SUSPENDED",
        message: "Votre compte a été suspendu. Contactez le support.",
        userId:  String(userId),
      });
    }
    await invalidateDashboardCache();
  }

  return updated;
};