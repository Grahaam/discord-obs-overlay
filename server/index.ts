import express from "express";
import { createServer as createHttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import { env } from "./env.js";
import { settingsManager } from "./settingsManager.js";
import { logManager } from "./logManager.js";
import { botManager } from "./discordBotManager.js";
import { setupRoutes } from "./routes.js";
import { updateYtDlp } from "./mediaParser.js";
import { alertManager } from "./alertManager.js";

dotenv.config();

const PORT = parseInt(env.PORT, 10);

// Setup server
async function runServer() {
  settingsManager.loadSettings();

  // Update yt-dlp on startup
  updateYtDlp().catch((err) => {
    console.error("[Server] yt-dlp update failed:", err);
  });

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api", apiLimiter);

  // Content-Security-Policy — set via HTTP headers so it applies to all routes
  // including the OBS browser source (meta tags are less reliable there).
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' ws: wss:",
    "frame-src https://www.youtube.com https://player.vimeo.com",
  ].join("; ");

  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", CSP);
    next();
  });

  const httpServer = createHttpServer(app);

  // Configure socket.io
  const io = new SocketServer(httpServer, {
    cors: {
      origin: [
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`,
      ],
      methods: ["GET", "POST"],
    },
  });

  // Set overlay emitter for bots
  botManager.setIo(io);

  io.on("connection", (socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    socket.on("get_initial_state", () => {
      console.log(`[Socket] Client ${socket.id} requested initial state`);
      socket.emit("initial_state", alertManager.getAlerts());
    });

    socket.on("alert_played", (alertId: string) => {
      console.log(`[Socket] Alert ${alertId} played, removing from queue`);
      alertManager.removeAlert(alertId);
      io.emit("remove_queue_item", alertId);
    });
  });

  // Lazily connect bot if settings loaded token
  if (settingsManager.settings.discordToken && settingsManager.settings.channelId) {
    botManager.connectBot(settingsManager.settings.discordToken, settingsManager.settings.channelId).catch((err) => {
      console.error("[Discord] Bot connection error:", err);
    });
  }

  // Setup server routes
  setupRoutes(app, io);

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Server] Unhandled route error:", err);

    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Integrate Vite for development, or serve built static files for production
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

  // Start the composite Server
  httpServer.listen(PORT, env.HOST, () => {
    console.log(`[Server] Stream OBS server active on ${env.HOST}:${PORT}`);
  });
}

runServer().catch((err) => {
  console.error("FATAL: Failed to initiate unified application container", err);
});