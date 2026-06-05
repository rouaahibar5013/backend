import jwt from "jsonwebtoken";

export const sendToken = (user, statusCode, message, res) => {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  const isProduction = process.env.NODE_ENV === "production";

  const {
    password, verification_token, reset_password_token,
    reset_password_expire, google_id, complete_account_token,
    complete_account_expire, ...safeUser
  } = user;

  res
    .status(statusCode)
    .cookie("token", token, {
      httpOnly: true,
      secure:   isProduction,
      sameSite: isProduction ? "None" : "Lax",
      maxAge:   7 * 24 * 60 * 60 * 1000,
    })
    .json({ success: true, user: safeUser, message });
    // ✅ Ne plus exposer le token dans le body — il est dans le cookie httpOnly
};