import Redis from "ioredis";

const redis = new Redis({
  host:     process.env.REDIS_HOST || "127.0.0.1",
  port:     Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  // ✅ Reconnexion automatique en cas de coupure
  retryStrategy: (times) => {
    if (times > 5) {
      console.error("[Redis] Trop de tentatives — abandon");
      return null; // stop retry
    }
    return Math.min(times * 200, 2000); // attend 200ms, 400ms... max 2s
  },

  // ✅ Timeout pour ne pas bloquer l'app si Redis est lent
  connectTimeout: 5000,   // 5s max pour se connecter
  commandTimeout: 3000,   // 3s max par commande

  // ✅ Keep-alive pour éviter les déconnexions silencieuses
  keepAlive: 10000,

  // ✅ Reconnexion automatique si la connexion est perdue
  enableAutoPipelining: true, // regroupe automatiquement les commandes simultanées
});

redis.on("connect",       () => console.log("[Redis] ✅ Connecté"));
redis.on("reconnecting",  () => console.warn("[Redis] 🔄 Reconnexion..."));
redis.on("error",         (err) => console.error("[Redis] ❌ Erreur:", err.message));

// ✅ Helper — set avec TTL par défaut (évite d'oublier le TTL)
export const setCache = async (key, value, ttlSeconds = 3600) => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error(`[Redis] Erreur setCache (${key}):`, err.message);
  }
};

// ✅ Helper — get avec parse JSON automatique
export const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`[Redis] Erreur getCache (${key}):`, err.message);
    return null; // Redis down → l'app continue sans cache
  }
};

export default redis;