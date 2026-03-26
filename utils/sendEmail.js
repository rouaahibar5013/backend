import nodemailer from "nodemailer";

// ═══════════════════════════════════════════════════════════
// SEND EMAIL
// Supporte les pièces jointes (PDF, etc.)
//
// Paramètres :
// to          → email destinataire
// subject     → sujet
// html        → contenu HTML
// attachments → [{ filename, content (Buffer), contentType }]
// ═══════════════════════════════════════════════════════════
const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from:    `"GOFFA 🧺" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments,
  };

  await transporter.sendMail(mailOptions);
};

export default sendEmail;