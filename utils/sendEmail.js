import nodemailer from "nodemailer";

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from:        `"GOFFA" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments, // ✅ ajouté ici
  });
};

export default sendEmail;