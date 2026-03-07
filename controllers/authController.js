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
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return next(new ErrorHandler("Please provide name, email and password.", 400));

  if (password.length < 6)
    return next(new ErrorHandler("Password must be at least 6 characters.", 400));

  const existingUser = await database.query(
    "SELECT id FROM users WHERE email = $1", [email]
  );
  if (existingUser.rows.length > 0)
    return next(new ErrorHandler("Email already in use.", 409));

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

  // Generate email verification token
  // rawToken → sent in email link
  // hashedToken → saved in DB
  const rawToken          = crypto.randomBytes(32).toString("hex");
  const verificationToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const result = await database.query(
    `INSERT INTO users
      (name, email, password, avatar, role, is_verified, verification_token)
     VALUES ($1, $2, $3, $4, 'user', false, $5)
     RETURNING id, name, email, avatar, role, is_verified`,
    [name, email, hashedPassword, avatarUrl, verificationToken]
  );

  const user = result.rows[0];

  // Send verification email with raw token in the link
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${rawToken}`;

  await sendEmail({
    to:      email,
    subject: "Verify your email — Ecommerce",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome ${name} !</h2>
        <p>Please click the button below to verify your email address.</p>
        <a href="${verificationUrl}"
           style="background: #4F46E5; color: white; padding: 12px 24px;
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

  // Hash the raw token from URL to compare with DB
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const result = await database.query(
    "SELECT * FROM users WHERE verification_token = $1", [hashedToken]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Invalid or expired verification link.", 400));

  const user = result.rows[0];

  if (user.is_verified)
    return next(new ErrorHandler("Email already verified.", 400));

  // ✅ FIX — update and return the updated user (not the old one)
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
    return next(new ErrorHandler("Please provide email and password.", 400));

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Invalid email or password.", 401));

  const user = result.rows[0];

  // Block login if email not verified
  if (!user.is_verified)
    return next(new ErrorHandler("Please verify your email before logging in.", 401));

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect)
    return next(new ErrorHandler("Invalid email or password.", 401));

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  sendToken(userWithoutPassword, 200, "Logged in successfully.", res);
});


// ═══════════════════════════════════════════════════════════
// GOOGLE AUTH CALLBACK
// GET /api/auth/google/callback
// Called by Google after user accepts permissions
// passport already found/created the user in passport.js
// ✅ FIX — uses jwt import instead of require()
// ═══════════════════════════════════════════════════════════
export const googleCallback = catchAsyncErrors(async (req, res, next) => {
  const user = req.user;

  if (!user)
    return next(new ErrorHandler("Google authentication failed.", 401));

  // Generate token using imported jwt
  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  // Set cookie and redirect to frontend
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
// Body: { email }
// Sends a reset link to the user's email
// ═══════════════════════════════════════════════════════════
export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;

  if (!email)
    return next(new ErrorHandler("Please provide your email.", 400));

  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  // Don't reveal if email exists or not (security)
  if (result.rows.length === 0) {
    return res.status(200).json({
      success: true,
      message: "If this email exists, a reset link has been sent.",
    });
  }

  const user = result.rows[0];

  // Generate reset token
  const rawToken    = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Token expires in 15 minutes
  const expireTime = new Date(Date.now() + 15 * 60 * 1000);

  await database.query(
    `UPDATE users
     SET reset_password_token=$1, reset_password_expire=$2
     WHERE id=$3`,
    [hashedToken, expireTime, user.id]
  );

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${rawToken}`;

  await sendEmail({
    to:      email,
    subject: "Reset your password — Ecommerce",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the button below :</p>
        <a href="${resetUrl}"
           style="background: #4F46E5; color: white; padding: 12px 24px;
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
// Body: { password }
// ═══════════════════════════════════════════════════════════
export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { token }    = req.params;
  const { password } = req.body;

  if (!password)
    return next(new ErrorHandler("Please provide a new password.", 400));

  if (password.length < 6)
    return next(new ErrorHandler("Password must be at least 6 characters.", 400));

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Find user with valid (not expired) token
  const result = await database.query(
    `SELECT * FROM users
     WHERE reset_password_token = $1
     AND reset_password_expire > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Reset link is invalid or has expired.", 400));

  const user = result.rows[0];

  const hashedPassword = await bcrypt.hash(password, 10);

  // Update password and clear reset token
  await database.query(
    `UPDATE users
     SET password=$1, reset_password_token=NULL, reset_password_expire=NULL
     WHERE id=$2`,
    [hashedPassword, user.id]
  );

  res.status(200).json({
    success: true,
    message: "Password reset successfully. You can now login.",
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
      message: "Logged out successfully.",
    });
});


// ═══════════════════════════════════════════════════════════
// GET MY PROFILE
// GET /api/auth/me
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const getMe = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT id, name, email, avatar, role, is_verified, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  res.status(200).json({
    success: true,
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PROFILE
// PUT /api/auth/me
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const { name } = req.body;

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
    `UPDATE users SET name=$1, avatar=$2
     WHERE id=$3
     RETURNING id, name, email, avatar, role, is_verified, created_at`,
    [name || user.rows[0].name, avatarUrl, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PASSWORD
// PUT /api/auth/password
// Requires: isAuthenticated
// ═══════════════════════════════════════════════════════════
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return next(new ErrorHandler("Please provide current and new password.", 400));

  if (newPassword.length < 6)
    return next(new ErrorHandler("New password must be at least 6 characters.", 400));

  const result = await database.query(
    "SELECT * FROM users WHERE id = $1", [req.user.id]
  );
  const user = result.rows[0];

  const isCorrect = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrect)
    return next(new ErrorHandler("Current password is incorrect.", 401));

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await database.query(
    "UPDATE users SET password=$1 WHERE id=$2",
    [hashedPassword, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: "Password updated successfully.",
  });
});