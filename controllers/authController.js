import bcrypt from "bcryptjs";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import { sendToken } from "../utils/jwtToken.js";
import { v2 as cloudinary } from "cloudinary";

// ═══════════════════════════════════════════════════════════
// REGISTER
// POST /api/auth/register
// Body: { name, email, password } + optional avatar file
// ═══════════════════════════════════════════════════════════
export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password } = req.body;

  // ── Validation ────────────────────────────────────────
  if (!name || !email || !password) {
    return next(new ErrorHandler("Please provide name, email and password.", 400));
  }

  if (password.length < 6) {
    return next(new ErrorHandler("Password must be at least 6 characters.", 400));
  }

  // ── Check if email already exists ────────────────────
  const existingUser = await database.query(
    "SELECT id FROM users WHERE email = $1", [email]
  );
  if (existingUser.rows.length > 0) {
    return next(new ErrorHandler("Email already in use.", 409));
  }

  // ── Upload avatar if provided ─────────────────────────
  let avatarUrl = null;
  if (req.files && req.files.avatar) {
    const result = await cloudinary.uploader.upload(
      req.files.avatar.tempFilePath,
      {
        folder: "Ecommerce_Avatars",
        width: 200,
        crop: "scale",
      }
    );
    avatarUrl = result.secure_url;
  }

  // ── Hash password before saving ───────────────────────
  // bcrypt transforms "mypassword123" into a hashed string
  // so it's never stored as plain text in the database
  const hashedPassword = await bcrypt.hash(password, 10);

  // ── Insert user ───────────────────────────────────────
  const result = await database.query(
    `INSERT INTO users (name, email, password, avatar, role)
     VALUES ($1, $2, $3, $4, 'user')
     RETURNING id, name, email, avatar, role, created_at`,
    [name, email, hashedPassword, avatarUrl]
  );

  const user = result.rows[0];

  // ── Send token via cookie ─────────────────────────────
  sendToken(user, 201, "Account created successfully.", res);
});


// ═══════════════════════════════════════════════════════════
// LOGIN
// POST /api/auth/login
// Body: { email, password }
// ═══════════════════════════════════════════════════════════
export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;

  // ── Validation ────────────────────────────────────────
  if (!email || !password) {
    return next(new ErrorHandler("Please provide email and password.", 400));
  }

  // ── Find user by email ────────────────────────────────
  const result = await database.query(
    "SELECT * FROM users WHERE email = $1", [email]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Invalid email or password.", 401));
  }

  const user = result.rows[0];

  // ── Compare password ──────────────────────────────────
  // bcrypt.compare checks if the plain password matches
  // the hashed one stored in the database
  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    return next(new ErrorHandler("Invalid email or password.", 401));
  }

  // ── Remove password from user object ──────────────────
  const { password: _, ...userWithoutPassword } = user;

  // ── Send token via cookie ─────────────────────────────
  sendToken(userWithoutPassword, 200, "Logged in successfully.", res);
});


// ═══════════════════════════════════════════════════════════
// LOGOUT
// POST /api/auth/logout
// Clears the cookie from the browser
// ═══════════════════════════════════════════════════════════
export const logout = catchAsyncErrors(async (req, res, next) => {
  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()), // expire immediately
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
  // req.user is attached by isAuthenticated middleware
  const result = await database.query(
    `SELECT id, name, email, avatar, role, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("User not found.", 404));
  }

  res.status(200).json({
    success: true,
    user: result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PROFILE
// PUT /api/auth/me
// Requires: isAuthenticated
// Body: { name } + optional avatar file
// ═══════════════════════════════════════════════════════════
export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const { name } = req.body;

  // Get current user data
  const user = await database.query(
    "SELECT * FROM users WHERE id = $1", [req.user.id]
  );

  // ── Handle avatar update ──────────────────────────────
  let avatarUrl = user.rows[0].avatar;
  if (req.files && req.files.avatar) {
    // Delete old avatar from Cloudinary if exists
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
    `UPDATE users
     SET name = $1, avatar = $2
     WHERE id = $3
     RETURNING id, name, email, avatar, role, created_at`,
    [name || user.rows[0].name, avatarUrl, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    user: result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE PASSWORD
// PUT /api/auth/password
// Requires: isAuthenticated
// Body: { currentPassword, newPassword }
// ═══════════════════════════════════════════════════════════
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ErrorHandler("Please provide current and new password.", 400));
  }

  if (newPassword.length < 6) {
    return next(new ErrorHandler("New password must be at least 6 characters.", 400));
  }

  // Get user with password from database
  const result = await database.query(
    "SELECT * FROM users WHERE id = $1", [req.user.id]
  );
  const user = result.rows[0];

  // Verify current password is correct
  const isCorrect = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrect) {
    return next(new ErrorHandler("Current password is incorrect.", 401));
  }

  // Hash and save new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await database.query(
    "UPDATE users SET password = $1 WHERE id = $2",
    [hashedPassword, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: "Password updated successfully.",
  });
});