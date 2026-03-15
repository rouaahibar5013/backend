import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { sendToken } from "../utils/jwtToken.js";
import * as authService from "../services/authService.js";

// ═══════════════════════════════════════════════════════════
// REGISTER
// POST /api/auth/register
// ═══════════════════════════════════════════════════════════
export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password, phone, address, city } = req.body;

  if (!name || !email || !password)
    return next(new ErrorHandler("Veuillez fournir un nom, un email et un mot de passe.", 400));

  if (password.length < 6)
    return next(new ErrorHandler("Le mot de passe doit contenir au moins 6 caractères.", 400));

  const user = await authService.registerUser({
    name, email, password, phone, address, city,
    avatarFile: req.files?.avatar,
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
// ═══════════════════════════════════════════════════════════
export const verifyEmail = catchAsyncErrors(async (req, res, next) => {
  const updatedUser = await authService.verifyUserEmail(req.params.token);
  sendToken(updatedUser, 200, "Email verified successfully. You are now logged in.", res);
});

// ═══════════════════════════════════════════════════════════
// LOGIN
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════
export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new ErrorHandler("Veuillez fournir un email et un mot de passe.", 400));

  const user = await authService.loginUser({ email, password });
  sendToken(user, 200, "Logged in successfully.", res);
});

// ═══════════════════════════════════════════════════════════
// GOOGLE AUTH CALLBACK
// GET /api/auth/google/callback
// ═══════════════════════════════════════════════════════════
export const googleCallback = catchAsyncErrors(async (req, res, next) => {
  const token = authService.googleCallbackToken(req.user);

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

  await authService.forgotUserPassword(email);

  // Toujours répondre pareil — sécurité (ne pas révéler si l'email existe)
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

  await authService.resetUserPassword({ token, password });

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
  const user = await authService.getUserById(req.user.id);

  res.status(200).json({
    success: true,
    user,
  });
});

// ═══════════════════════════════════════════════════════════
// UPDATE PROFILE
// PUT /api/auth/me
// ═══════════════════════════════════════════════════════════
export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const { name, phone, address, city } = req.body;

  const user = await authService.updateUserProfile({
    userId: req.user.id,
    name, phone, address, city,
    avatarFile: req.files?.avatar,
  });

  res.status(200).json({
    success: true,
    message: "Profil mis à jour avec succès.",
    user,
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

  await authService.updateUserPassword({
    userId: req.user.id,
    currentPassword,
    newPassword,
  });

  res.status(200).json({
    success: true,
    message: "Mot de passe modifié avec succès.",
  });
});

// ═══════════════════════════════════════════════════════════
// COMPLETE ACCOUNT
// POST /api/auth/complete-account/:token
// ═══════════════════════════════════════════════════════════
export const completeAccount = catchAsyncErrors(async (req, res, next) => {
  const { token }                     = req.params;
  const { password, confirmPassword } = req.body;

  if (!password || !confirmPassword)
    return next(new ErrorHandler("Please provide password and confirmPassword.", 400));

  if (password !== confirmPassword)
    return next(new ErrorHandler("Passwords do not match.", 400));

  if (password.length < 6)
    return next(new ErrorHandler("Password must be at least 6 characters.", 400));

  const user = await authService.completeUserAccount({ token, password });

  sendToken(user, 200, "Account completed successfully. You are now logged in.", res);
});