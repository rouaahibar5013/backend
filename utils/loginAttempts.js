import redis from "../config/redis.js";

const MAX_ATTEMPTS  = 5;
const BLOCK_SECONDS = 15 * 60; // 15 min

// Clé Redis par userId + IP
const key = (userId, ip) => `login_attempts:${userId}:${ip}`;

// Vérifie si bloqué — appeler AVANT bcrypt.compare
export const checkLoginBlock = async (userId, ip) => {
  const data = await redis.get(key(userId, ip));
  if (!data) return;

  const { attempts } = JSON.parse(data);
  if (attempts >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key(userId, ip));
    const minutes = Math.ceil(ttl / 60);
    throw new Error(`BLOCKED:${minutes}`); // attrapé dans loginUser
  }
};

// Incrémente le compteur d'échecs
export const recordFailedLogin = async (userId, ip) => {
  const k    = key(userId, ip);
  const data = await redis.get(k);
  const attempts = data ? JSON.parse(data).attempts + 1 : 1;

  await redis.set(k, JSON.stringify({ attempts }), "EX", BLOCK_SECONDS);
};

// Réinitialise après connexion réussie
export const clearLoginAttempts = async (userId, ip) => {
  await redis.del(key(userId, ip));
};