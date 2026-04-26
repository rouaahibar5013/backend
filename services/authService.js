import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt    from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import database      from "../database/db.js";
import ErrorHandler  from "../middlewares/errorMiddleware.js";
import sendEmail     from "../utils/sendEmail.js";
import { linkSubscriptionToUserService } from "./emailcampaignService.js";
import { checkLoginBlock, recordFailedLogin, clearLoginAttempts } from "../utils/loginAttempts.js";



// ══════════════════════════════════════════════════════════════════════════
// HELPERS INTERNES
// ══════════════════════════════════════════════════════════════════════════

/**
 * Valide la force du mot de passe.
 * Règles : 8+ caractères, 1 minuscule, 1 majuscule, 1 chiffre, 1 caractère spécial.
 */
export const validatePassword = (password) => {
  if (!password || typeof password !== "string")
    throw new ErrorHandler("Le mot de passe est requis.", 400);

  const errors = [];

  if (password.length < 10)
    errors.push("au moins 10 caractères");
  if (!/[a-z]/.test(password))
    errors.push("une lettre minuscule");
  if (!/[A-Z]/.test(password))
    errors.push("une lettre majuscule");
  if (!/[0-9]/.test(password))
    errors.push("un chiffre");
  if (!/[!@#$%^&*()\-_=+\[\]{};':",.<>/?`~\\|]/.test(password))
    errors.push("un caractère spécial (!@#$%^&*…)");

  if (errors.length > 0)
    throw new ErrorHandler(
      `Le mot de passe doit contenir : ${errors.join(", ")}.`,
      400
    );
};
/**
 * Valide le format d'un email.
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== "string")
    throw new ErrorHandler("L'email est requis.", 400);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email.trim()))
    throw new ErrorHandler("Format d'email invalide.", 400);
};

/**
 * Génère un couple rawToken (pour l'email) / hashedToken (pour la DB).
 */
const generateTokenPair = () => {
  const rawToken    = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, hashedToken };
};

/**
 * Supprime un avatar Cloudinary à partir de son URL.
 */
const destroyCloudinaryAvatar = async (url) => {
  if (!url) return;
  const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  if (matches) {
    await cloudinary.uploader.destroy(matches[1]).catch((err) =>
      console.error("[Cloudinary] delete error:", err.message)
    );
  }
};

// ── Email templates ──────────────────────────────────────────────────────

const wrapEmail = (bodyHtml) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#166534;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
      <h1 style="color:white;margin:0;">🧺 GOFFA</h1>
      <p style="color:#86efac;margin:5px 0 0;">artisanat tunisien</p>
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
  // 1. Validation des inputs
  validateEmail(email);
  validatePassword(password);

  if (!name || name.trim().length < 2)
    throw new ErrorHandler("Le nom doit contenir au moins 2 caractères.", 400);

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Vérifier si l'email est déjà utilisé
  const existingUser = await database.query(
    "SELECT id, google_id FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    // ✅ FIX : distinguer compte Google du compte classique
    if (existingUser.rows[0].google_id) {
      throw new ErrorHandler(
        "Ce compte utilise la connexion Google. Cliquez sur 'Se connecter avec Google'.",
        409
      );
    }
    throw new ErrorHandler("Cet email est déjà utilisé.", 409);
  }

  // 3. Upload avatar (optionnel)
  let avatarUrl = null;
  if (avatarFile) {
    const result = await cloudinary.uploader.upload(avatarFile.tempFilePath, {
      folder: "Ecommerce_Avatars",
      width:  200,
      crop:   "scale",
    });
    avatarUrl = result.secure_url;
  }

  // 4. Hash du mot de passe (bcrypt, 12 rounds — plus sûr que 10)
  const hashedPassword = await bcrypt.hash(password, 12);

  // 5. Token de vérification d'email (24h)
  const { rawToken, hashedToken } = generateTokenPair();
  const verificationExpire        = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // 6. Insertion en DB
  const result = await database.query(
    `INSERT INTO users
       (name, email, password, avatar, role, is_verified,
        verification_token, verification_token_expire,
        phone, address, city)
     VALUES ($1,$2,$3,$4,'user',false,$5,$6,$7,$8,$9)
     RETURNING id, name, email, avatar, role, is_verified, phone, address, city`,
    [
      name.trim(), normalizedEmail, hashedPassword, avatarUrl,
      hashedToken, verificationExpire,
      phone || null, address || null, city || null,
    ]
  );

  const user = result.rows[0];

  // 7. Email de vérification
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      normalizedEmail,
    subject: "Vérifiez votre email — GOFFA 🧺",
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

  // 8. Relier abonnement newsletter si email déjà inscrit anonymement
  await linkSubscriptionToUserService({ userId: user.id, email: normalizedEmail });

  return user;
};


// ══════════════════════════════════════════════════════════════════════════
// RESEND VERIFICATION EMAIL  ← NOUVEAU
// ══════════════════════════════════════════════════════════════════════════
export const resendVerificationEmailService = async (email) => {
  validateEmail(email);
  const normalizedEmail = email.trim().toLowerCase();

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1",
    [normalizedEmail]
  );

  // Réponse silencieuse si email inconnu (évite l'énumération)
  if (result.rows.length === 0) return true;

  const user = result.rows[0];

  // Déjà vérifié → pas besoin de renvoyer
  if (user.is_verified)
    throw new ErrorHandler("Ce compte est déjà vérifié. Connectez-vous.", 400);

  // Génère un nouveau token
  const { rawToken, hashedToken } = generateTokenPair();
  const expire = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await database.query(
    `UPDATE users
     SET verification_token=$1, verification_token_expire=$2
     WHERE id=$3`,
    [hashedToken, expire, user.id]
  );

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      normalizedEmail,
    subject: "Nouveau lien de vérification — GOFFA 🧺",
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
    throw new ErrorHandler("Email déjà vérifié. Vous pouvez vous connecter.", 400);

  const updated = await database.query(
    `UPDATE users
     SET is_verified = true,
         verification_token = NULL,
         verification_token_expire = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, avatar, role, is_verified, created_at`,
    [user.id]
  );

  return updated.rows[0];
};


// ══════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════
export const loginUser = async ({ email, password, ip}) => {
  validateEmail(email);

  if (!password) throw new ErrorHandler("Le mot de passe est requis.", 400);

  const normalizedEmail = email.trim().toLowerCase();

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1",
    [normalizedEmail]
  );

  // ✅ Message générique pour éviter l'énumération d'emails
  if (result.rows.length === 0)
    throw new ErrorHandler("Email ou mot de passe incorrect.", 401);

  const user = result.rows[0];

  // Compte suspendu
  if (user.is_active === false)
    throw new ErrorHandler(
      "Votre compte a été suspendu. Contactez le support.", 403
    );

  // ✅ Compte Google (sans password)
  if (!user.password) {
    if (user.google_id) {
      throw new ErrorHandler(
        "Ce compte utilise la connexion Google. Cliquez sur 'Se connecter avec Google'.",
        401
      );
    }
    // Compte guest sans password (lien complete-account)
    throw new ErrorHandler(
      "Veuillez compléter votre compte via le lien reçu par email.", 401
    );
  }

  // Email non vérifié
  if (!user.is_verified)
    throw new ErrorHandler(
      "Veuillez vérifier votre email avant de vous connecter.", 401
    );


 try {
    await checkLoginBlock(user.id, ip);
  } catch (err) {
    if (err.message.startsWith("BLOCKED:")) {
      const minutes = err.message.split(":")[1];
      throw new ErrorHandler(
        `Compte temporairement bloqué après trop d'échecs. Réessayez dans ${minutes} minute(s).`, 429
      );
    }
  }





 const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    await recordFailedLogin(user.id, ip);
    throw new ErrorHandler("Email ou mot de passe incorrect.", 401);
  }
  // ✅ Connexion réussie → effacer les échecs
  await clearLoginAttempts(user.id, ip);

// ══════ MFA — générer OTP ══════
  const otp        = Math.floor(100000 + Math.random() * 900000).toString(); // 6 chiffres
  const otpHashed  = crypto.createHash("sha256").update(otp).digest("hex");
  const otpExpire  = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await database.query(
    `UPDATE users SET mfa_otp=$1, mfa_otp_expire=$2, updated_at=NOW() WHERE id=$3`,
    [otpHashed, otpExpire, user.id]
  );

  await sendEmail({
    to:      normalizedEmail,
    subject: "Votre code de connexion — GOFFA 🧺",
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

 // ✅ Retourner un mfaSessionToken signé à la place du userId brut
  const mfaSessionToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );
  return { mfaRequired: true, mfaSessionToken };
};




// ══════════════════════════════════════════════════════════════════════════
// VERIFY MFA OTP
// ══════════════════════════════════════════════════════════════════════════
export const verifyMfaService = async ({ mfaSessionToken, otp }) => {
  if (!mfaSessionToken || !otp)
    throw new ErrorHandler("mfaSessionToken et otp sont requis.", 400);

  // ✅ Vérifier et décoder le token MFA
  let userId;
  try {
    const decoded = jwt.verify(mfaSessionToken, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch {
    throw new ErrorHandler("Session MFA expirée. Recommencez la connexion.", 401);
  }

  const result = await database.query(
    `SELECT * FROM users WHERE id=$1 AND mfa_otp IS NOT NULL AND mfa_otp_expire > NOW()`,
    [userId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Code invalide ou expiré. Recommencez la connexion.", 401);

  const user = result.rows[0];

  const otpHashed = crypto.createHash("sha256").update(otp).digest("hex");
  if (otpHashed !== user.mfa_otp)
    throw new ErrorHandler("Code incorrect.", 401);

  await database.query(
    `UPDATE users SET mfa_otp=NULL, mfa_otp_expire=NULL, updated_at=NOW() WHERE id=$1`,
    [userId]
  );

  await linkSubscriptionToUserService({ userId: user.id, email: user.email });

  const { password: _, mfa_otp: __, mfa_otp_expire: ___, ...userClean } = user;
  return userClean;
};


// ══════════════════════════════════════════════════════════════════════════
// GOOGLE CALLBACK
// ══════════════════════════════════════════════════════════════════════════
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


// ══════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ══════════════════════════════════════════════════════════════════════════
export const forgotUserPassword = async (email) => {
  validateEmail(email);
  const normalizedEmail = email.trim().toLowerCase();

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1",
    [normalizedEmail]
  );

  // ✅ Toujours retourner true pour éviter l'énumération d'emails
  if (result.rows.length === 0) return true;

  const user = result.rows[0];

  // Compte Google sans password → pas de reset possible
  if (!user.password && user.google_id) return true;

  const { rawToken, hashedToken } = generateTokenPair();
  const expireTime = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await database.query(
    `UPDATE users
     SET reset_password_token=$1, reset_password_expire=$2, updated_at=NOW()
     WHERE id=$3`,
    [hashedToken, expireTime, user.id]
  );

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      normalizedEmail,
    subject: "Réinitialisation de mot de passe — GOFFA 🧺",
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

  // ✅ Validation force du password
  validatePassword(password);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const result = await database.query(
    `SELECT * FROM users
     WHERE reset_password_token = $1
       AND reset_password_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Lien de réinitialisation invalide ou expiré.", 400);

  const user = result.rows[0];

  // Empêcher la réutilisation du même mot de passe
  if (user.password) {
    const isSame = await bcrypt.compare(password, user.password);
    if (isSame)
      throw new ErrorHandler(
        "Le nouveau mot de passe doit être différent de l'ancien.", 400
      );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await database.query(
    `UPDATE users
     SET password=$1,
         reset_password_token=NULL,
         reset_password_expire=NULL,
         updated_at=NOW()
     WHERE id=$2`,
    [hashedPassword, user.id]
  );

  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// GET USER BY ID
// ══════════════════════════════════════════════════════════════════════════
export const getUserById = async (id) => {
  const result = await database.query(
    `SELECT id, name, email, avatar, role, is_verified, is_active,
            phone, address, city,
            billing_full_name, billing_phone, billing_address,
            billing_city, billing_governorate, billing_postal_code, billing_country,
            shipping_full_name, shipping_phone, shipping_address,
            shipping_city, shipping_governorate, shipping_postal_code, shipping_country,
            google_id IS NOT NULL AS has_google,
            created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  return result.rows[0];
};

// ══════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE
// ✅ name, avatar, phone, address, city → champs auth
// ✅ phone  → propage aussi vers billing_phone  (sync auto)
// ✅ address → propage aussi vers billing_address (sync auto)
// ✅ city   → propage aussi vers billing_city   (sync auto)
// ✅ billing_* et shipping_* restent modifiables indépendamment
// ══════════════════════════════════════════════════════════════════════════
export const updateUserProfile = async ({
  userId, name, phone, address, city,
  avatarFile, deleteAvatar,
}) => {
  const userResult = await database.query(
    "SELECT * FROM users WHERE id = $1", [userId]
  );

  if (userResult.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  const cu = userResult.rows[0]; // current user
  let avatarUrl = cu.avatar;

  // ── Suppression avatar ───────────────────────────────
  if (deleteAvatar === "true" || deleteAvatar === true) {
    await destroyCloudinaryAvatar(cu.avatar);
    avatarUrl = null;
  }

  // ── Remplacement avatar ──────────────────────────────
  if (avatarFile) {
    await destroyCloudinaryAvatar(cu.avatar);
    const upload = await cloudinary.uploader.upload(avatarFile.tempFilePath, {
      folder: "Ecommerce_Avatars",
      width:  200,
      crop:   "scale",
    });
    avatarUrl = upload.secure_url;
  }

  // ── Valeurs finales des champs auth ──────────────────
  const newPhone   = phone   ?? cu.phone;
  const newAddress = address ?? cu.address;
  const newCity    = city    ?? cu.city;

  // ✅ Sync auto : si le champ auth change → billing aussi
  // COALESCE : on ne remplace que si la nouvelle valeur est non-null
  // Logique : si l'user met à jour phone → billing_phone suit
  //           si l'user ne touche pas phone → billing_phone reste inchangé
  const newBillingPhone   = phone   !== undefined ? newPhone   : cu.billing_phone;
  const newBillingAddress = address !== undefined ? newAddress : cu.billing_address;
  const newBillingCity    = city    !== undefined ? newCity    : cu.billing_city;

  const result = await database.query(
    `UPDATE users
     SET
       -- Champs auth
       name    = $1,
       avatar  = $2,
       phone   = $3,
       address = $4,
       city    = $5,
       -- Sync auto billing (phone/address/city)
       billing_phone   = $6,
       billing_address = $7,
       billing_city    = $8,
       updated_at = NOW()
     WHERE id = $9
     RETURNING
       id, name, email, avatar, role, is_verified, is_active,
       phone, address, city,
       billing_full_name, billing_phone, billing_address,
       billing_city, billing_governorate, billing_postal_code, billing_country,
       shipping_full_name, shipping_phone, shipping_address,
       shipping_city, shipping_governorate, shipping_postal_code, shipping_country,
       created_at, updated_at`,
    [
      name?.trim() || cu.name,
      avatarUrl,
      newPhone,
      newAddress,
      newCity,
      newBillingPhone,
      newBillingAddress,
      newBillingCity,
      userId,
    ]
  );

  return result.rows[0];
};
// ══════════════════════════════════════════════════════════════════════════
// UPDATE PASSWORD
// ══════════════════════════════════════════════════════════════════════════
export const updateUserPassword = async ({ userId, currentPassword, newPassword }) => {
  const result = await database.query(
    "SELECT * FROM users WHERE id = $1", [userId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  const user = result.rows[0];

  // ✅ FIX : compte Google sans password
  if (!user.password) {
    if (user.google_id) {
      throw new ErrorHandler(
        "Ce compte utilise Google. Vous ne pouvez pas modifier de mot de passe ici.", 400
      );
    }
    throw new ErrorHandler(
      "Veuillez d'abord compléter votre compte via le lien reçu par email.", 400
    );
  }

  // Vérifier l'ancien mot de passe
  const isCorrect = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrect)
    throw new ErrorHandler("Le mot de passe actuel est incorrect.", 401);

  // ✅ Valider la force du nouveau mot de passe
  validatePassword(newPassword);

  // ✅ Empêcher la réutilisation du même mot de passe
  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame)
    throw new ErrorHandler(
      "Le nouveau mot de passe doit être différent de l'ancien.", 400
    );

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await database.query(
    "UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2",
    [hashedPassword, userId]
  );

  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// CREATE GUEST ACCOUNT
// Appelé automatiquement quand un guest passe une commande
// ══════════════════════════════════════════════════════════════════════════
export const createGuestAccountService = async ({
  name, email, phone, shipping_address, shipping_city,
}) => {
  validateEmail(email);
  const normalizedEmail = email.trim().toLowerCase();

  // ✅ FIX : si l'user existe déjà, vérifier si son compte est complet
  const existingUser = await database.query(
    "SELECT * FROM users WHERE email = $1", [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    const user = existingUser.rows[0];

    // Compte déjà complet (a un password) → retourner le compte existant
    if (user.password) return user;

    // ✅ FIX : compte guest sans password (lien expiré ou jamais cliqué)
    // → regénérer un nouveau lien complete-account
    const { rawToken, hashedToken } = generateTokenPair();
    const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await database.query(
      `UPDATE users
       SET complete_account_token=$1, complete_account_expire=$2, updated_at=NOW()
       WHERE id=$3`,
      [hashedToken, expireTime, user.id]
    );

    const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${encodeURIComponent(rawToken)}`;

    await sendEmail({
      to:      normalizedEmail,
      subject: "Votre lien pour créer votre mot de passe — GOFFA 🧺",
      html: wrapEmail(`
        <h2>Bonjour ${user.name} !</h2>
        <p>Une nouvelle commande a été passée. Voici un nouveau lien pour créer votre mot de passe :</p>
        ${ctaButton(completeUrl, "Créer mon mot de passe →")}
        <p style="color:#666;font-size:14px;">Ce lien expire dans <strong>7 jours</strong>.</p>
      `),
    });

    return user;
  }

  // Nouveau guest → créer le compte
  const { rawToken, hashedToken } = generateTokenPair();
  const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const newUser = await database.query(
    `INSERT INTO users
       (name, email, phone, shipping_address, shipping_city,
        role, is_verified, complete_account_token, complete_account_expire)
     VALUES ($1,$2,$3,$4,$5,'user',false,$6,$7)
     RETURNING *`,
    [
      name.trim(), normalizedEmail, phone || null,
      shipping_address, shipping_city,
      hashedToken, expireTime,
    ]
  );

  const user = newUser.rows[0];

  const completeUrl = `${process.env.FRONTEND_URL}/complete-account/${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to:      normalizedEmail,
    subject: "Complétez votre compte — GOFFA 🧺",
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
// COMPLETE ACCOUNT (guest → compte complet)
// ══════════════════════════════════════════════════════════════════════════
export const completeUserAccount = async ({ token, password }) => {
  if (!token) throw new ErrorHandler("Token manquant.", 400);

  // ✅ Valider la force du password
  validatePassword(password);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const result = await database.query(
    `SELECT * FROM users
     WHERE complete_account_token=$1
       AND complete_account_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Lien invalide ou expiré.", 400);

  const user = result.rows[0];
  const hashedPassword = await bcrypt.hash(password, 12);

  const updated = await database.query(
    `UPDATE users
     SET password=$1, is_verified=true,
         complete_account_token=NULL, complete_account_expire=NULL,
         updated_at=NOW()
     WHERE id=$2
     RETURNING id, name, email, avatar, role, is_verified,
               phone, address, city, created_at`,
    [hashedPassword, user.id]
  );

  await linkSubscriptionToUserService({ userId: user.id, email: user.email });

  return updated.rows[0];
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — GET ALL USERS (avec pagination)
// ══════════════════════════════════════════════════════════════════════════
export const getAllUsersService = async ({ page = 1, limit = 20, search = "" }) => {
  const offset = (page - 1) * limit;

  if (search) {
    // Query principale : LIMIT=$1, OFFSET=$2, search=$3
    const [usersResult, countResult] = await Promise.all([
      database.query(
        `SELECT id, name, email, avatar, role, is_verified, is_active,
                phone, city, google_id IS NOT NULL AS has_google,
                created_at, updated_at
         FROM users
         WHERE name ILIKE $3 OR email ILIKE $3
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, `%${search}%`]
      ),
      database.query(
        // ✅ COUNT séparée : search=$1 uniquement
        `SELECT COUNT(*) FROM users WHERE name ILIKE $1 OR email ILIKE $1`,
        [`%${search}%`]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);
    return { users: usersResult.rows, total, page, totalPages: Math.ceil(total / limit) };
  }
  

  // Sans search
  const [usersResult, countResult] = await Promise.all([
    database.query(
      `SELECT id, name, email, avatar, role, is_verified, is_active,
              phone, city, google_id IS NOT NULL AS has_google,
              created_at, updated_at
       FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    database.query(`SELECT COUNT(*) FROM users`),
  ]);

  const total = parseInt(countResult.rows[0].count);
  return { users: usersResult.rows, total, page, totalPages: Math.ceil(total / limit) };
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — DELETE USER
// ══════════════════════════════════════════════════════════════════════════
export const deleteUserService = async ({ userId, requestingAdminId }) => {
  // ✅ Un admin ne peut pas se supprimer lui-même
  if (userId === requestingAdminId)
    throw new ErrorHandler("Vous ne pouvez pas supprimer votre propre compte.", 400);

  const userResult = await database.query(
    "SELECT id, role FROM users WHERE id = $1", [userId]
  );

  if (userResult.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  // ✅ Optionnel : empêcher la suppression d'un autre admin
  if (userResult.rows[0].role === "admin")
    throw new ErrorHandler(
      "Impossible de supprimer un administrateur. Révoquez son rôle d'abord.", 403
    );

  await database.query("DELETE FROM users WHERE id = $1", [userId]);

  return true;
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — UPDATE USER ROLE
// ══════════════════════════════════════════════════════════════════════════
export const updateUserRoleService = async ({ userId, role, requestingAdminId }) => {
  if (!["user", "admin"].includes(role))
    throw new ErrorHandler("Rôle invalide. Valeurs acceptées : 'user', 'admin'.", 400);

  // ✅ Empêcher un admin de se dégrader lui-même
  if (userId === requestingAdminId)
    throw new ErrorHandler("Vous ne pouvez pas modifier votre propre rôle.", 400);

  const result = await database.query(
    `UPDATE users SET role=$1, updated_at=NOW()
     WHERE id=$2
     RETURNING id, name, email, role, is_verified, is_active, created_at`,
    [role, userId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  return result.rows[0];
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — SUSPEND / ACTIVATE USER
// ══════════════════════════════════════════════════════════════════════════
export const suspendUserService = async ({ userId, requestingAdminId }) => {
  if (userId === requestingAdminId)
    throw new ErrorHandler("Vous ne pouvez pas suspendre votre propre compte.", 400);

  const result = await database.query(
    `UPDATE users SET is_active=false, updated_at=NOW()
     WHERE id=$1
     RETURNING id, name, email, role, is_active`,
    [userId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  return result.rows[0];
};

export const activateUserService = async (userId) => {
  const result = await database.query(
    `UPDATE users SET is_active=true, updated_at=NOW()
     WHERE id=$1
     RETURNING id, name, email, role, is_active`,
    [userId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  return result.rows[0];
};


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — UPDATE USER (toutes infos)
// ══════════════════════════════════════════════════════════════════════════
export const adminUpdateUserService = async ({
  userId, requestingAdminId,
  name, email, phone, address, city,
  role, is_verified, is_active, newPassword,
}) => {
  const userResult = await database.query(
    "SELECT * FROM users WHERE id=$1", [userId]
  );

  if (userResult.rows.length === 0)
    throw new ErrorHandler("Utilisateur introuvable.", 404);

  const current = userResult.rows[0];

  // Vérifier l'unicité de l'email
  if (email && email.trim().toLowerCase() !== current.email) {
    validateEmail(email);
    const emailExists = await database.query(
      "SELECT id FROM users WHERE email=$1 AND id!=$2",
      [email.trim().toLowerCase(), userId]
    );
    if (emailExists.rows.length > 0)
      throw new ErrorHandler("Cet email est déjà utilisé.", 409);
  }

  // Valider le rôle
  if (role && !["user", "admin"].includes(role))
    throw new ErrorHandler("Rôle invalide.", 400);

  // ✅ Empêcher un admin de se rétrograder lui-même
  if (userId === requestingAdminId && role && role !== "admin")
    throw new ErrorHandler("Vous ne pouvez pas modifier votre propre rôle.", 400);

  // Hash du nouveau password si fourni
  let hashedPassword = current.password;
  if (newPassword) {
    validatePassword(newPassword); // ✅ même règles partout
    hashedPassword = await bcrypt.hash(newPassword, 12);
  }

  const normalizedEmail = email ? email.trim().toLowerCase() : current.email;

  const result = await database.query(
    `UPDATE users
     SET name=$1, email=$2, phone=$3, address=$4, city=$5,
         role=$6, is_verified=$7, is_active=$8, password=$9,
         updated_at=NOW()
     WHERE id=$10
     RETURNING id, name, email, avatar, role, is_verified,
               is_active, phone, address, city, created_at, updated_at`,
    [
      name?.trim()  || current.name,
      normalizedEmail,
      phone         ?? current.phone,
      address       ?? current.address,
      city          ?? current.city,
      role          || current.role,
      is_verified   ?? current.is_verified,
      is_active     ?? current.is_active,
      hashedPassword,
      userId,
    ]
  );

  return result.rows[0];
};