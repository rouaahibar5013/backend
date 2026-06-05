import nodemailer from "nodemailer";

// ✅ Transporter créé une seule fois au chargement du module
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  await transporter.sendMail({
    from:        `"GOFFA" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments,
  });
};

export default sendEmail;