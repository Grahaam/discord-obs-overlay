import express from "express";
import fs from "fs";
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
import { updateYtDlp, cleanupOrphanedTempFiles, startMediaParser } from "./mediaParser.js";
import { alertManager } from "./alertManager.js";
import { initDb, loadPersistedAlerts, loadPersistedLogs, incrementMediaPlayCount } from "./db.js";
import { logManager } from "./logManager.js";
import { serverLogManager } from "./serverLogManager.js";
import { logger } from "./logger.js";
import { trollRestore } from "./obsManager.js";
import { APP_PATHS } from "./paths.js";

dotenv.config();

const PORT = parseInt(env.PORT, 10);
const HEARTBEAT_INTERVAL_MS = 5000;

async function runServer() {
  settingsManager.loadSettings();

  // Phase 1: cleanup orphaned downloads from previous run
  cleanupOrphanedTempFiles();
  startMediaParser();

  // Phase 3: initialize SQLite persistence and restore state
  initDb();
  const persistedAlerts = loadPersistedAlerts();
  const persistedLogs = loadPersistedLogs();
  alertManager.restoreFromDb(persistedAlerts);
  logManager.restoreFromDb(persistedLogs);

  // Update yt-dlp on startup (non-blocking)
  updateYtDlp().catch((err) => {
    logger.error({ err }, "yt-dlp update failed");
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

  // Read/polling endpoints — generous limit (dashboard polls every 4s = ~900/hour, plus 2 docks = ~2700/hour)
  const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/logs", readLimiter);
  app.use("/api/server-logs", readLimiter);
  app.use("/api/bot-status", readLimiter);
  app.use("/api/settings", readLimiter);
  app.use("/api/media-cache", readLimiter);
  app.use("/api/health", readLimiter);
  app.use("/api", writeLimiter);

  // Phase 4: CSP hardening — set via HTTP headers (more reliable in OBS than meta tags)
  const isDev = env.NODE_ENV === "development";
  const CSP = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com ${isDev ? "*" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self' ws: wss: ${isDev ? "*" : ""}`,
    "frame-src https://www.youtube.com https://youtube.com https://player.vimeo.com",
  ]
    .filter(Boolean)
    .join("; ");

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

  logManager.onLogAdded = (log) => {
    io.emit("new_log", log);
  };

  serverLogManager.onLogAdded = (log) => {
    io.emit("new_server_log", log);
  };

  // Capture unhandled process errors into server log ring
  process.on("uncaughtException", (err) => {
    serverLogManager.add("fatal", "Uncaught exception", { message: err.message, name: err.name });
  });
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    serverLogManager.add("error", "Unhandled promise rejection", { reason: msg });
  });

  // Phase 3: heartbeat — lets overlay detect server restarts and reconcile queue state
  const heartbeatInterval = setInterval(() => {
    io.emit("heartbeat", {
      ts: Date.now(),
      queueSize: alertManager.getAlerts().length,
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Single source of truth for what is currently playing
  let currentlyPlaying: import("../src/types.js").AlertPayload | null = null;

  io.on("connection", (socket) => {
    if (env.NODE_ENV !== "production") {
      logger.debug({ socketId: socket.id, total: io.engine.clientsCount }, "Socket connected");
    }

    socket.on("get_initial_state", () => {
      socket.emit("initial_state", alertManager.getAlerts());
      socket.emit("now_playing", currentlyPlaying);
      socket.emit("initial_logs", logManager.getLogs());
      socket.emit("initial_server_logs", serverLogManager.getLogs());
      socket.emit("bot_status_update", {
        status: botManager.status,
        botUser: botManager.botUser,
        errorMsg: botManager.errorMsg,
        overlayPaused: botManager.overlayPaused,
      });
    });

    socket.on("alert_started", (alertId: string) => {
      const alert =
        alertManager.getAlerts().find((a) => a.id === alertId) ??
        (currentlyPlaying?.id === alertId ? currentlyPlaying : null);
      currentlyPlaying = alert ?? null;
      io.emit("now_playing", currentlyPlaying);
    });

    socket.on("alert_played", (alertId: string) => {
      logger.info({ alertId }, "Alert played");
      const playedAlert = alertManager.getAlerts().find((a) => a.id === alertId);
      if (playedAlert?.mediaUrl?.startsWith("/api/media-cache/")) {
        incrementMediaPlayCount(playedAlert.mediaUrl.replace("/api/media-cache/", ""));
      }
      alertManager.removeAlert(alertId);
      if (currentlyPlaying?.id === alertId) {
        currentlyPlaying = null;
        io.emit("now_playing", null);
      }
      io.emit("remove_queue_item", alertId);
    });

    socket.on("troll_dismissed", () => {
      trollRestore().catch(() => {});
    });

    socket.on("disconnect", () => {});

    // Playback state updates from overlay clients (broadcast to other clients)
    socket.on(
      "playback_state",
      (state: { isPaused?: boolean; currentTime?: number; duration?: number; volume?: number }) => {
        // Broadcast to all other connected clients
        socket.broadcast.emit("playback_state", state);
      }
    );
  });

  if (settingsManager.settings.discordToken && settingsManager.settings.channelId) {
    botManager.connectBot(settingsManager.settings.discordToken, settingsManager.settings.channelId).catch((err) => {
      logger.error({ err }, "Discord bot connection error");
    });
  }

  setupRoutes(app, io);

  // New update check endpoint
  app.get("/api/check-update", async (req, res) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(APP_PATHS.packageJson, 'utf8'));
        const response = await fetch("https://api.github.com/repos/Grahaam/discord-obs-overlay/releases/latest");
        const latest = await response.json();
        res.json({
            current: pkg.version,
            latest: latest.tag_name.replace('v', ''),
            updateAvailable: latest.tag_name.replace('v', '') !== pkg.version,
            downloadUrl: latest.html_url
        });
    } catch (e) {
        res.status(500).json({ error: "Update check failed" });
    }
  });

  if (env.NODE_ENV === "production") {
    const distPath = APP_PATHS.distDir;
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    logger.error({ err }, "Unhandled route error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  httpServer.listen(PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: PORT }, "Stream Alert server active");
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    clearInterval(heartbeatInterval);
    httpServer.close();
  });
}

runServer().catch((err) => {
  logger.fatal({ err }, "Failed to initiate unified application container");
});
