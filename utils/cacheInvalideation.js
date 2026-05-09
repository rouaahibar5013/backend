import redis from "../config/redis.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TTL centralisés + intelligents par période
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const TTL = {
  // Dashboard — varie selon la période demandée
  DASHBOARD_TODAY:   2 * 60,        // 2 min  — données du jour, changent vite
  DASHBOARD_7DAYS:   30 * 60,       // 30 min — semi-stable
  DASHBOARD_30DAYS:  60 * 60,       // 1h     — stable
  DASHBOARD_YEAR:    6 * 60 * 60,   // 6h     — très stable

  // Pages publiques
  HOME:              30 * 60,       // 30 min — homepage
  OFFRES_HOME:       60 * 60,       // 1h     — offres
  FEATURED:          2 * 60 * 60,   // 2h     — produits vedettes

  // Autres
  OFFRES_DETAIL:     60 * 60,       // 1h
  RECHERCHE:         10 * 60,       // 10 min
  SESSION:           24 * 60 * 60,  // 24h
};

// Helper — choisir le bon TTL selon la période du dashboard
export const getDashboardTTL = (period) => {
  const map = {
    today:   TTL.DASHBOARD_TODAY,
    "7days": TTL.DASHBOARD_7DAYS,
    "30days":TTL.DASHBOARD_30DAYS,
    year:    TTL.DASHBOARD_YEAR,
  };
  return map[period] ?? TTL.DASHBOARD_30DAYS;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scan non-bloquant (remplace redis.keys)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const scanAndDelete = async (pattern) => {
  let cursor = "0", deleted = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== "0");
  return deleted;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Invalidations individuelles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const invalidateDashboardCache = async () => {
  try {
    const n = await scanAndDelete("dashboard:*");
    if (n > 0) console.log(`[Redis] ♻️  dashboard — ${n} clé(s) supprimée(s)`);
  } catch (err) {
    console.error("[Redis] Erreur invalidation dashboard:", err.message);
  }
};

export const invalidateOffresCache = async () => {
  try {
    await redis.del("offres:homepage");
    console.log("[Redis] ♻️  offres:homepage supprimé");
  } catch (err) {
    console.error("[Redis] Erreur invalidation offres:", err.message);
  }
};

// ✅ NOUVEAU — invalider la homepage
export const invalidateHomeCache = async () => {
  try {
    await redis.del("home:data");
    console.log("[Redis] ♻️  home:data supprimé");
  } catch (err) {
    console.error("[Redis] Erreur invalidation home:", err.message);
  }
};

// ✅ NOUVEAU — invalider les produits vedettes
export const invalidateFeaturedCache = async () => {
  try {
    const n = await scanAndDelete("products:featured:*");
    if (n > 0) console.log(`[Redis] ♻️  featured — ${n} clé(s) supprimée(s)`);
  } catch (err) {
    console.error("[Redis] Erreur invalidation featured:", err.message);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tout invalider d'un coup (ex: après import massif)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const invalidateAllCaches = async () => {
  await Promise.all([
    invalidateDashboardCache(),
    invalidateOffresCache(),
    invalidateHomeCache(),      // ✅ ajouté
    invalidateFeaturedCache(),  // ✅ ajouté
  ]);
  console.log("[Redis] ✅ Tous les caches invalidés");
};