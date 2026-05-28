import express from "express";
import { createServer as createHttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import { env } from "./env.js";
import { settingsManager } from "./settingsManager.js";
import { botManager } from "./discordBotManager.js";
import { setupRoutes } from "./routes.js";
import { updateYtDlp, cleanupOrphanedTempFiles } from "./mediaParser.js";
import { alertManager } from "./alertManager.js";
import { initDb, loadPersistedAlerts, loadPersistedLogs } from "./db.js";
import { logManager } from "./logManager.js";

dotenv.config();

const PORT = parseInt(env.PORT, 10);
const HEARTBEAT_INTERVAL_MS = 5000;

async function runServer() {
  settingsManager.loadSettings();

  // Phase 1: cleanup orphaned downloads from previous run
  cleanupOrphanedTempFiles();

  // Phase 3: initialize SQLite persistence and restore state
  initDb();
  const persistedAlerts = loadPersistedAlerts();
  const persistedLogs = loadPersistedLogs();
  alertManager.restoreFromDb(persistedAlerts);
  logManager.restoreFromDb(persistedLogs);

  // Update yt-dlp on startup (non-blocking)
  updateYtDlp().catch((err) => {
    console.error("[Server] yt-dlp update failed:", err);
  });

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Write/action endpoints — tight limit (prevent accidental loops on mutations)
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Read/polling endpoints — generous limit (dashboard polls every 4s = ~900/hour)
  const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/logs", readLimiter);
  app.use("/api/bot-status", readLimiter);
  app.use("/api/settings", readLimiter);
  app.use("/api/media-cache", readLimiter);
  app.use("/api", writeLimiter);

  // Phase 4: CSP hardening — set via HTTP headers (more reliable in OBS than meta tags)
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' ws: wss:",
    "frame-src https://www.youtube.com https://youtube.com https://player.vimeo.com",
  ].join("; ");

  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", CSP);
    next();
  });

  const httpServer = createHttpServer(app);

  // Phase 4: keep Socket.IO bound to localhost only
  const io = new SocketServer(httpServer, {
    cors: {
      origin: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
      methods: ["GET", "POST"],
    },
  });

  botManager.setIo(io);

  // Phase 3: heartbeat — lets overlay detect server restarts and reconcile queue state
  const heartbeatInterval = setInterval(() => {
    io.emit("heartbeat", {
      ts: Date.now(),
      queueSize: alertManager.getAlerts().length,
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Track which socket IDs are real OBS overlay windows (not dashboard embeds)
  const overlayClients = new Set<string>();

  io.on("connection", (socket) => {
    if (env.NODE_ENV !== "production") {
      console.log(`[Socket] Connect: ${socket.id} (total: ${io.engine.clientsCount})`);
    }

    socket.on("get_initial_state", () => {
      socket.emit("initial_state", alertManager.getAlerts());
    });

    socket.on("alert_played", (alertId: string) => {
      console.log(`[Socket] Alert ${alertId} played`);
      alertManager.removeAlert(alertId);
      io.emit("remove_queue_item", alertId);
    });

    // OBS overlay windows register themselves so dashboard embeds know not to consume alerts
    socket.on("register_as_overlay", () => {
      overlayClients.add(socket.id);
      io.emit("overlay_count", overlayClients.size);
    });

    socket.on("disconnect", () => {
      if (overlayClients.has(socket.id)) {
        overlayClients.delete(socket.id);
        io.emit("overlay_count", overlayClients.size);
      }
    });
  });

  if (settingsManager.settings.discordToken && settingsManager.settings.channelId) {
    botManager.connectBot(settingsManager.settings.discordToken, settingsManager.settings.channelId).catch((err) => {
      console.error("[Discord] Bot connection error:", err);
    });
  }

  setupRoutes(app, io);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    console.error("[Server] Unhandled route error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  if (env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, env.HOST, () => {
    console.log(`[Server] Stream OBS server active on ${env.HOST}:${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    clearInterval(heartbeatInterval);
    httpServer.close();
  });
}

runServer().catch((err) => {
  console.error("FATAL: Failed to initiate unified application container", err);
});
