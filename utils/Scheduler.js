import cron     from "node-cron";
import database from "../database/db.js";
import sendEmail from "./sendEmail.js";
import { notifyUser, notifyAdmins } from "./websocket.js";

export const startScheduler = () => {

  // ════════════════════════════════════════════════════════════
  // RÈGLE 1 — Toutes les 15 min
  // en_attente > 24h sans action → urgente
  // ════════════════════════════════════════════════════════════
  cron.schedule("*/15 * * * *", async () => {
    try {
      const urgentes = await database.query(`
        UPDATE reclamations r
        SET status     = 'urgente',
            updated_at = NOW()
        FROM users u
        WHERE r.user_id    = u.id
          AND r.status     = 'en_attente'
          AND r.created_at < NOW() - INTERVAL '24 hours'
        RETURNING
          r.id, r.user_id, r.reclamation_type,
          u.name  AS user_name,
          u.email AS user_email
      `);

      for (const r of urgentes.rows) {
        console.log(`[Scheduler] → urgente: ${r.id.slice(0,8)}`);

        // WS admin
        notifyAdmins({
          type    : "RECLAMATION_URGENTE",
          id      : r.id,
          message : `⚡ Réclamation #${r.id.slice(0,8).toUpperCase()} sans réponse depuis 24h`,
        });

        // WS client
        notifyUser(r.user_id, {
          type    : "RECLAMATION_UPDATE",
          id      : r.id,
          status  : "urgente",
          message : "Votre réclamation a été escaladée en priorité.",
        });

        // Email client (fallback si WS down)
        await sendEmail({
          to      : r.user_email,
          subject : `⚡ Réclamation #${r.id.slice(0,8).toUpperCase()} — escaladée en priorité`,
          html    : `
            <div style="font-family:Arial;max-width:600px;margin:0 auto;">
              <div style="background:#166534;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
                <h1 style="color:white;margin:0;">🧺 GOFFA</h1>
              </div>
              <div style="padding:25px;background:#fafafa;">
                <p>Bonjour ${r.user_name},</p>
                <p>Votre réclamation <strong>#${r.id.slice(0,8).toUpperCase()}</strong>
                   n'a pas encore reçu de réponse depuis plus de 24h.</p>
                <p>Elle a été <strong>marquée urgente</strong> et sera traitée en priorité.</p>
                <p style="color:#6b7280;font-size:13px;">
                  Nous nous excusons pour ce délai.
                </p>
              </div>
            </div>
          `,
        }).catch(err => console.error("[Scheduler] Email urgente:", err.message));
      }

    } catch (err) {
      console.error("[Scheduler] Règle 1 erreur:", err.message);
    }
  });

  // ════════════════════════════════════════════════════════════
  // RÈGLE 2 — Toutes les 15 min
  // en_cours + deadline_at dépassée → en_retard
  // ════════════════════════════════════════════════════════════
  cron.schedule("*/15 * * * *", async () => {
    try {
      const retards = await database.query(`
        UPDATE reclamations r
        SET status     = 'en_retard',
            updated_at = NOW()
        FROM users u
        WHERE r.user_id      = u.id
          AND r.status       = 'en_cours'
          AND r.deadline_at  IS NOT NULL
          AND r.deadline_at  < NOW()
        RETURNING
          r.id, r.user_id,
          u.name  AS user_name,
          u.email AS user_email
      `);

      for (const r of retards.rows) {
        console.log(`[Scheduler] → en_retard: ${r.id.slice(0,8)}`);

        // WS admin
        notifyAdmins({
          type    : "RECLAMATION_EN_RETARD",
          id      : r.id,
          message : `⏰ Réclamation #${r.id.slice(0,8).toUpperCase()} : deadline dépassée !`,
        });

        // WS + Email client
        notifyUser(r.user_id, {
          type    : "RECLAMATION_UPDATE",
          id      : r.id,
          status  : "en_retard",
          message : "Le délai de traitement de votre réclamation a été dépassé.",
        });

        await sendEmail({
          to      : r.user_email,
          subject : `⏰ Réclamation #${r.id.slice(0,8).toUpperCase()} — délai dépassé`,
          html    : `
            <div style="font-family:Arial;max-width:600px;margin:0 auto;">
              <div style="padding:25px;background:#fafafa;">
                <p>Bonjour ${r.user_name},</p>
                <p>Le délai de traitement prévu pour votre réclamation
                   <strong>#${r.id.slice(0,8).toUpperCase()}</strong> a été dépassé.</p>
                <p>Notre équipe va la traiter dans les plus brefs délais.</p>
              </div>
            </div>
          `,
        }).catch(err => console.error("[Scheduler] Email retard:", err.message));
      }

    } catch (err) {
      console.error("[Scheduler] Règle 2 erreur:", err.message);
    }
  });

  // ════════════════════════════════════════════════════════════
  // RÈGLE 3 — Toutes les heures
  // urgente ou en_retard depuis > 48h → email superviseur
  // ════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════
// RÈGLE 3 — Toutes les heures
// urgente ou en_retard depuis > 48h → email aux admins
// ════════════════════════════════════════════════════════════
cron.schedule("0 * * * *", async () => {
  try {
    const [critiques, admins] = await Promise.all([
      // Réclamations critiques non traitées
      database.query(`
        SELECT id
        FROM reclamations
        WHERE status IN ('urgente', 'en_retard')
          AND updated_at < NOW() - INTERVAL '48 hours'
      `),
      // Tous les admins de la DB
      database.query(`
        SELECT email, name
        FROM users
        WHERE role = 'admin'
      `)
    ]);

    if (critiques.rows.length > 0 && admins.rows.length > 0) {
      // Envoyer à chaque admin
      await Promise.all(
        admins.rows.map(admin =>
          sendEmail({
            to      : admin.email,
            subject : `🚨 ${critiques.rows.length} réclamations critiques non traitées`,
            html    : `
              <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                <div style="background:#166534;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
                  <h1 style="color:white;margin:0;">🧺 GOFFA</h1>
                </div>
                <div style="padding:25px;background:#fafafa;">
                  <p>Bonjour ${admin.name},</p>
                  <p><strong>${critiques.rows.length} réclamations</strong> sont urgentes
                     ou en retard depuis plus de 48h et n'ont pas encore été traitées.</p>
                  <p style="color:#dc2626;font-weight:bold;">
                    Merci d'intervenir immédiatement depuis le dashboard.
                  </p>
                </div>
              </div>
            `,
          }).catch(err => console.error(`[Scheduler] Email admin ${admin.email}:`, err.message))
        )
      );
    }

  } catch (err) {
    console.error("[Scheduler] Règle 3 erreur:", err.message);
  }
});

// ════════════════════════════════════════════════════════════
// RÈGLE 4 — Tous les jours à minuit
// is_new = true + created_at > 30 jours → is_new = false
// ════════════════════════════════════════════════════════════
cron.schedule("0 0 * * *", async () => {
  try {
    const result = await database.query(
      `UPDATE products
       SET is_new = false, updated_at = NOW()
       WHERE is_new = true
       AND created_at < NOW() - INTERVAL '30 days'`
    );
    console.log(`[Scheduler] is_new expiré: ${result.rowCount} produit(s)`);
  } catch (err) {
    console.error("[Scheduler] Règle 4 erreur:", err.message);
  }
});

}