import redis from "../config/redis.js";
import jwt   from "jsonwebtoken";

// Ajoute le token à la blacklist jusqu'à son expiration naturelle
export const blacklistToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`blacklist:${token}`, "1", "EX", ttl);
    }
  } catch {
    // token malformé → on ignore
  }
};

// Vérifie si le token est blacklisté
export const isTokenBlacklisted = async (token) => {
  const result = await redis.get(`blacklist:${token}`);
  return result !== null;
};