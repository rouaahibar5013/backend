import nodemailer from "nodemailer";

// ═══════════════════════════════════════════════════════════
// SEND EMAIL UTILITY
// Used for:
//   - Email verification after register
//   - Password reset link
// ═══════════════════════════════════════════════════════════
const sendEmail = async ({ to, subject, html }) => {
  // ── Create transporter (Gmail) ────────────────────────
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,   // smtp.gmail.com
    port: process.env.EMAIL_PORT,   // 587
    auth: {
      user: process.env.EMAIL_USER, // ton email Gmail
      pass: process.env.EMAIL_PASS, // ton app password Gmail
    },
  });

  // ── Send the email ────────────────────────────────────
  await transporter.sendMail({
    from:    `"Ecommerce" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

export default sendEmail;