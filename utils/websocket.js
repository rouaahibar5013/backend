import { WebSocketServer } from "ws";

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
    // Le client envoie ?userId=xxx&role=admin dans l'URL de connexion
    const params = new URLSearchParams(req.url?.split("?")[1]);
    const userId = params.get("userId");
    const role   = params.get("role");

    if (!userId) { ws.close(); return; }

    // Stocker la connexion
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

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

    console.log(`[WS] Connecté: ${userId} (${role || "user"}) — adminIds actuels: [${[...adminIds].join(', ')}]`);
  });

  console.log("[WS] WebSocket server initialisé");
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
console.log(`[WS] notifyAdmins: ${payload.type} → adminIds: [${[...adminIds].join(', ')}]`);
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