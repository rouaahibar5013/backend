import { WebSocketServer } from "ws";
import jwt from 'jsonwebtoken';
import cookie from 'cookie';

let wss;

// userId (string) → Set de connexions WebSocket
const clients = new Map();

// Rôles des users connectés (pour cibler admins)
const adminIds = new Set();

// Buffer circulaire des 20 dernières notifications admin
const recentAdminNotifications = [];
const MAX_BUFFER = 20;

// ─── Initialisation (appelée une seule fois dans server.js) ───
export const initWebSocket = (httpServer) => {
  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    let userId, role = "user";
    try {
        const cookies = cookie.parse(req.headers.cookie || '');
        const token   = cookies.token;
        if (!token) { ws.close(); return; }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = String(decoded.id);   // ← adjust field name to match your JWT payload
        role   = decoded.role || "user";
    } catch {
        ws.close(); return;            // token absent ou invalide → reject
    }

    if (!userId) { ws.close(); return; }

    if (role === "admin") {
      adminIds.add(userId);

      // Envoyer les notifications manquées dans les 30 dernières secondes
      const thirtySecondsAgo = Date.now() - 30_000;
      const missed = recentAdminNotifications.filter(n => n._sentAt > thirtySecondsAgo);
      missed.forEach(n => {
        try { ws.send(JSON.stringify(n)); }
        catch (_) {}
      });
    }

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    if (process.env.NODE_ENV !== 'production') {         
      console.log(`[WS] Connecté: ${userId} (${role})`);
    }

    // Ping toutes les 30s pour garder la connexion vivante
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30_000);

    ws.on("close", () => {
      clearInterval(pingInterval);
      clients.get(userId)?.delete(ws);
      if (clients.get(userId)?.size === 0) {
        clients.delete(userId);
        adminIds.delete(userId);
      }
    });

    ws.on("error", (err) => {
      console.error(`[WS] Erreur client ${userId}:`, err.message);
    });

  });

};

// ─── Notifier un user spécifique (client) ─────────────────────
export const notifyUser = (userId, payload) => {
  const sockets = clients.get(String(userId));
  if (!sockets) return;

  const message = JSON.stringify(payload);
  sockets.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(message); }
      catch (err) { console.error("[WS] Erreur envoi:", err.message); }
    }
  });
};

// ─── Notifier tous les admins connectés ───────────────────────
export const notifyAdmins = (payload) => {
  // Stocker dans le buffer avec timestamp
  recentAdminNotifications.push({ ...payload, _sentAt: Date.now() });
  if (recentAdminNotifications.length > MAX_BUFFER) {
    recentAdminNotifications.shift();
  }

  const message = JSON.stringify(payload);
  adminIds.forEach(adminId => {
    clients.get(adminId)?.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(message); }
        catch (err) { console.error("[WS] Erreur admin:", err.message); }
      }
    });
  });
};