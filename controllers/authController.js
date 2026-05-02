import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler         from "../middlewares/errorMiddleware.js";
import { blacklistToken } from "../utils/tokenBlacklist.js";
import * as authService     from "../services/authService.js";
import { sendToken } from "../utils/jwtToken.js";


// ══════════════════════════════════════════════════════════════════════════
// REGISTER
// POST /api/auth/register
// ══════════════════════════════════════════════════════════════════════════
export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password, phone, address, city } = req.body;
  const avatarFile = req.files?.avatar || null;

  const user = await authService.registerUser({
    name, email, password, phone, address, city, avatarFile,
  });

  res.status(201).json({
    success: true,
    message:
      "Compte créé avec succès. Un email de vérification a été envoyé à votre adresse.",
    user,
  });
});


// ══════════════════════════════════════════════════════════════════════════
// RESEND VERIFICATION EMAIL  ← NOUVEAU
// POST /api/auth/resend-verification
// ══════════════════════════════════════════════════════════════════════════
export const resendVerification = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;

  await authService.resendVerificationEmailService(email);

  // ✅ Réponse toujours identique (pas d'énumération)
  res.status(200).json({
    success: true,
    message:
      "Si cet email existe et n'est pas encore vérifié, un nouveau lien a été envoyé.",
  });
});


// ══════════════════════════════════════════════════════════════════════════
// VERIFY EMAIL
// GET /api/auth/verify-email/:token
// ══════════════════════════════════════════════════════════════════════════
export const verifyEmail = catchAsyncErrors(async (req, res, next) => {
  const user = await authService.verifyUserEmail(req.params.token);

  res.status(200).json({
    success: true,
    message: "Email vérifié avec succès. Vous pouvez maintenant vous connecter.",
    user,
  });
});


// ══════════════════════════════════════════════════════════════════════════
// LOGIN
// POST /api/auth/login
// ══════════════════════════════════════════════════════════════════════════
export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const result = await authService.loginUser({ email, password, ip });

  // MFA requis → pas de token encore
  if (result.mfaRequired) {
    return res.status(200).json({
      success: true,
      mfaRequired: true,
      mfaSessionToken: result.mfaSessionToken,
      message: "Un code de vérification a été envoyé à votre adresse email.",
    });
  }

  sendToken(result, 200, "Connexion réussie.", res);
});


// ══════════════════════════════════════════════════════════════════════════
// VERIFY MFA
// POST /api/auth/login/verify-mfa
// ══════════════════════════════════════════════════════════════════════════
export const verifyMfa = catchAsyncErrors(async (req, res, next) => {
  const { mfaSessionToken, otp } = req.body;
  if (!mfaSessionToken || !otp)
    return next(new ErrorHandler("mfaSessionToken et otp sont requis.", 400));
  const user = await authService.verifyMfaService({ mfaSessionToken, otp });
  sendToken(user, 200, "Connexion réussie.", res);
})

// ══════════════════════════════════════════════════════════════════════════
// LOGOUT
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════════════════
export const logout = catchAsyncErrors(async (req, res, next) => {
  const token = req.cookies?.token; // ✅ récupérer avant d'effacer

  if (token) {
    await blacklistToken(token); // ✅ invalider côté serveur
  }

  res.cookie("token", "", {
    httpOnly: true,
    expires:  new Date(0),
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  });

  res.status(200).json({ success: true, message: "Déconnexion réussie." });
});


// ══════════════════════════════════════════════════════════════════════════
// GOOGLE CALLBACK
// GET /api/auth/google/callback
// ══════════════════════════════════════════════════════════════════════════
export const googleCallback = catchAsyncErrors(async (req, res, next) => {
  const token = authService.googleCallbackToken(req.user);

  const isProduction = process.env.NODE_ENV === "production";

  // ✅ Mettre le token dans un cookie sécurisé (même logique que login)
  res.cookie("token", token, {
    httpOnly: true,
    secure:   isProduction,
    sameSite: isProduction ? "None" : "Lax",
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });

  // Rediriger vers le frontend
 res.redirect(`${process.env.FRONTEND_URL}/login/success?auth=google`);
});


// ══════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// ══════════════════════════════════════════════════════════════════════════
export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;

  await authService.forgotUserPassword(email);

  // ✅ Toujours retourner le même message (évite l'énumération)
  res.status(200).json({
    success: true,
    message:
      "Si cet email est associé à un compte, un lien de réinitialisation a été envoyé.",
  });
});


// ══════════════════════════════════════════════════════════════════════════
// RESET PASSWORD
// POST /api/auth/reset-password/:token
// ══════════════════════════════════════════════════════════════════════════
export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { password } = req.body;

  await authService.resetUserPassword({
    token:    req.params.token,
    password,
  });

  res.status(200).json({
    success: true,
    message: "Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.",
  });
});


// ══════════════════════════════════════════════════════════════════════════
// GET ME
// GET /api/auth/me
// ══════════════════════════════════════════════════════════════════════════
export const getMe = catchAsyncErrors(async (req, res, next) => {
  const user = await authService.getUserById(req.user.id);

  res.status(200).json({ success: true, user });
});


// ══════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE
// PUT /api/auth/me
// ══════════════════════════════════════════════════════════════════════════
export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const avatarFile = req.files?.avatar || null;

  const user = await authService.updateUserProfile({
    userId:      req.user.id,
    ...req.body,
    avatarFile,
  });

  res.status(200).json({
    success: true,
    message: "Profil mis à jour avec succès.",
    user,
  });
});


// ══════════════════════════════════════════════════════════════════════════
// UPDATE PASSWORD
// PUT /api/auth/password
// ══════════════════════════════════════════════════════════════════════════
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return next(new ErrorHandler("L'ancien et le nouveau mot de passe sont requis.", 400));

  await authService.updateUserPassword({
    userId: req.user.id,
    currentPassword,
    newPassword,
  });

  const token = req.cookies?.token;
  if (token) await blacklistToken(token); // ✅ invalider l'ancien token

  res.cookie("token", "", {
    httpOnly: true,
    expires:  new Date(0),
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  });

  res.status(200).json({
    success: true,
    message: "Mot de passe modifié avec succès. Veuillez vous reconnecter.",
  });
});

// ══════════════════════════════════════════════════════════════════════════
// COMPLETE ACCOUNT (guest)
// POST /api/auth/complete-account/:token
// ══════════════════════════════════════════════════════════════════════════
export const completeAccount = catchAsyncErrors(async (req, res, next) => {
  const { password } = req.body;
  const user = await authService.completeUserAccount({
    token:    req.params.token,
    password,
  });
  sendToken(user, 200, "Compte complété avec succès. Vous êtes maintenant connecté.", res);
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — GET ALL USERS (avec pagination)
// GET /api/auth/users?page=1&limit=20&search=
// ══════════════════════════════════════════════════════════════════════════
export const getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const search = req.query.search          || "";

  // ✅ Limiter le max de résultats par requête
  if (limit > 100)
    return next(new ErrorHandler("La limite maximale par page est 100.", 400));

const role   = req.query.role   || "";
const status = req.query.status || "";
const data = await authService.getAllUsersService({ page, limit, search, role, status });
  res.status(200).json({ success: true, ...data });
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — DELETE USER
// DELETE /api/auth/users/:userId
// ══════════════════════════════════════════════════════════════════════════
export const deleteUser = catchAsyncErrors(async (req, res, next) => {
  await authService.deleteUserService({
    userId:             req.params.userId,
    requestingAdminId:  req.user.id, // ✅ pour empêcher l'auto-suppression
  });

  res.status(200).json({ success: true, message: "Utilisateur supprimé." });
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — UPDATE USER ROLE
// PATCH /api/auth/users/:userId/role
// ══════════════════════════════════════════════════════════════════════════
export const updateUserRole = catchAsyncErrors(async (req, res, next) => {
  const { role } = req.body;

  if (!role)
    return next(new ErrorHandler("Le rôle est requis.", 400));

  const user = await authService.updateUserRoleService({
    userId:            req.params.userId,
    role,
    requestingAdminId: req.user.id,
  });

  res.status(200).json({ success: true, message: "Rôle mis à jour.", user });
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — SUSPEND USER
// PATCH /api/auth/users/:userId/suspend
// ══════════════════════════════════════════════════════════════════════════
export const suspendUser = catchAsyncErrors(async (req, res, next) => {
  const user = await authService.suspendUserService({
    userId:            req.params.userId,
    requestingAdminId: req.user.id,
  });

  res.status(200).json({ success: true, message: "Utilisateur suspendu.", user });
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — ACTIVATE USER
// PATCH /api/auth/users/:userId/activate
// ══════════════════════════════════════════════════════════════════════════
export const activateUser = catchAsyncErrors(async (req, res, next) => {
  const user = await authService.activateUserService(req.params.userId);

  res.status(200).json({ success: true, message: "Utilisateur activé.", user });
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN — UPDATE USER (toutes infos)
// PUT /api/auth/users/:userId
// ══════════════════════════════════════════════════════════════════════════
export const adminUpdateUser = catchAsyncErrors(async (req, res, next) => {
  const {
    name, email, phone, address, city,
    role, is_verified, is_active, newPassword,
  } = req.body;

  const user = await authService.adminUpdateUserService({
    userId:            req.params.userId,
    requestingAdminId: req.user.id,
    name, email, phone, address, city,
    role, is_verified, is_active, newPassword,
  });

  res.status(200).json({ success: true, message: "Utilisateur mis à jour.", user });
});