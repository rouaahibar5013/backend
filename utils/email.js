// ============================================================
//  utils/email.js — Envoi d'emails transactionnels (Nodemailer)
// ============================================================

const nodemailer = require('nodemailer');

// ── Création du transporteur SMTP ───────────────────────────
const createTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

// ── Template HTML commun à tous les emails ───────────────────
const htmlTemplate = (content) => `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#f0fdf4;margin:0;padding:20px;}
  .card{max-width:540px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.1);}
  .header{background:linear-gradient(135deg,#16a34a,#059669);padding:32px;text-align:center;color:#fff;}
  .header h1{font-size:26px;margin:0;font-weight:900;letter-spacing:-1px;}
  .header p{color:#d1fae5;margin:6px 0 0;font-size:12px;letter-spacing:2px;}
  .body{padding:36px 32px;color:#374151;}
  .body h2{color:#111827;font-size:20px;margin:0 0 12px;}
  .body p{line-height:1.7;font-size:15px;color:#6b7280;}
  .btn{display:inline-block;background:linear-gradient(135deg,#16a34a,#059669);color:#fff!important;
       text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;
       font-size:15px;margin:20px 0;box-shadow:0 6px 20px rgba(22,163,74,.35);}
  .badge{background:#dcfce7;color:#16a34a;padding:6px 14px;border-radius:50px;
         font-size:12px;font-weight:700;display:inline-block;margin-bottom:16px;}
  .footer{background:#f9fafb;padding:18px 32px;text-align:center;font-size:12px;
          color:#9ca3af;border-top:1px solid #e5e7eb;}
</style></head><body>
<div class="card">
  <div class="header"><h1>🌿 BIOVITA</h1><p>NATURELLEMENT BON</p></div>
  <div class="body">${content}</div>
  <div class="footer">© ${new Date().getFullYear()} BIOVITA — Tous droits réservés</div>
</div></body></html>`;

// ── Envoi : vérification d'email ─────────────────────────────
const sendVerificationEmail = async (to, firstName, token) => {
  const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  await createTransporter().sendMail({
    from:    process.env.EMAIL_FROM,
    to,
    subject: '✅ Vérifiez votre email — BIOVITA',
    html: htmlTemplate(`
      <div class="badge">✉️ Vérification du compte</div>
      <h2>Bienvenue, ${firstName} ! 🎉</h2>
      <p>Merci de rejoindre la famille BIOVITA ! Cliquez ci-dessous pour activer votre compte.</p>
      <a href="${url}" class="btn">✅ Vérifier mon email</a>
      <p style="font-size:13px;color:#9ca3af;">
        Lien valable <strong>24 heures</strong>.<br/>
        Si vous n'avez pas créé de compte, ignorez cet email.
      </p>`),
  });
};

// ── Envoi : réinitialisation du mot de passe ─────────────────
const sendPasswordResetEmail = async (to, firstName, token) => {
  const url     = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  const expires = process.env.RESET_TOKEN_EXPIRES || 15;
  await createTransporter().sendMail({
    from:    process.env.EMAIL_FROM,
    to,
    subject: '🔐 Réinitialisation de votre mot de passe — BIOVITA',
    html: htmlTemplate(`
      <div class="badge">🔐 Réinitialisation</div>
      <h2>Réinitialisez votre mot de passe</h2>
      <p>Bonjour <strong>${firstName}</strong>,</p>
      <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.</p>
      <a href="${url}" class="btn">🔑 Réinitialiser mon mot de passe</a>
      <p style="font-size:13px;color:#9ca3af;">
        Lien valable <strong>${expires} minutes</strong>.<br/>
        Si vous n'avez pas fait cette demande, ignorez cet email.
      </p>`),
  });
};

// ── Envoi : email de bienvenue après vérification ────────────
const sendWelcomeEmail = async (to, firstName) => {
  await createTransporter().sendMail({
    from:    process.env.EMAIL_FROM,
    to,
    subject: '🌿 Bienvenue chez BIOVITA — Compte activé !',
    html: htmlTemplate(`
      <div class="badge">🌿 Compte activé</div>
      <h2>Votre compte est prêt ! 🎉</h2>
      <p>Bonjour <strong>${firstName}</strong>,</p>
      <p>Votre compte est maintenant vérifié. Découvrez nos produits bio et passez votre première commande !</p>
      <a href="${process.env.FRONTEND_URL}/shop" class="btn">🛒 Commencer à magasiner</a>`),
  });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail };
