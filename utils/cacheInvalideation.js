import redis from "../config/redis.js";

// Efface tous les caches dashboard (toutes les périodes)
export const invalidateDashboardCache = async () => {
  try {
    const keys = await redis.keys("dashboard:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] Cache invalidé — ${keys.length} clé(s) supprimée(s)`);
    }
  } catch (err) {
    console.error("[Redis] Erreur invalidation cache:", err.message);
  }
};


// ✅ Nouveau — Offres homepage
export const invalidateOffresCache = async () => {
  try {
    await redis.del("offres:homepage");
    console.log("[Redis] Cache invalidé — offres:homepage");
  } catch (err) {
    console.error("[Redis] Erreur invalidation offres:", err.message);
  }
};

// ✅ Nouveau — Invalider les deux en même temps
export const invalidateAllCaches = async () => {
  await Promise.all([
    invalidateDashboardCache(),
    invalidateOffresCache(),
  ]);
};