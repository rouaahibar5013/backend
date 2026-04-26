import rateLimit from "express-rate-limit";

// ── Login : 5 tentatives / 15 min par IP ─────────────────
export const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: "Trop de tentatives de connexion. Réessayez dans 15 minutes.",
  },
});

// ── Verify MFA : 5 tentatives / 10 min par IP ────────────
export const mfaLimiter = rateLimit({
  windowMs:         10 * 60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: "Trop de tentatives MFA. Recommencez la connexion.",
  },
});

// ── Register : 5 inscriptions / heure par IP ─────────────
export const registerLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: "Trop d'inscriptions depuis cette adresse. Réessayez dans 1 heure.",
  },
});

// ── Forgot password : 3 demandes / heure par IP ──────────
export const forgotPasswordLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              3,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: "Trop de demandes de réinitialisation. Réessayez dans 1 heure.",
  },
});