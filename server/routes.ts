import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { z } from "zod";
import { Server as SocketServer } from "socket.io";
import os from "os";
import { exec } from "child_process";
import { logger } from "./logger.js";
import { settingsManager } from "./settingsManager.js";
import { logManager } from "./logManager.js";
import { serverLogManager } from "./serverLogManager.js";
import { botManager } from "./discordBotManager.js";
import { resolveMediaFromLink, _ytDlpCustomPath } from "./mediaParser.js";
import { alertManager } from "./alertManager.js";

// Helper to get yt-dlp version
let _ytDlpVersionCache: string | null = null;
let _ytDlpVersionExpiry = 0;

function getYtDlpVersion(): Promise<string> {
  if (_ytDlpVersionCache && Date.now() < _ytDlpVersionExpiry) {
    return Promise.resolve(_ytDlpVersionCache);
  }
  const ytDlpBin = _ytDlpCustomPath ?? "yt-dlp";
  return new Promise((resolve) => {
    exec(`"${ytDlpBin}" --version`, (error, stdout) => {
      const version = error ? "Not installed / Error" : stdout.trim();
      _ytDlpVersionCache = version;
      _ytDlpVersionExpiry = Date.now() + 5 * 60_000;
      resolve(version);
    });
  });
}

// Helper to get cache stats
let _cacheStatsCache: { totalSize: number; fileCount: number } | null = null;
let _cacheStatsExpiry = 0;

async function getCacheStats() {
  if (_cacheStatsCache && Date.now() < _cacheStatsExpiry) {
    return _cacheStatsCache;
  }
  const cacheDir = path.join(process.cwd(), "media_cache");
  if (!fs.existsSync(cacheDir)) {
    _cacheStatsCache = { totalSize: 0, fileCount: 0 };
    _cacheStatsExpiry = Date.now() + 60_000;
    return _cacheStatsCache;
  }
  try {
    const files = await fs.promises.readdir(cacheDir);
    let totalSize = 0;
    let fileCount = 0;
    for (const file of files) {
      try {
        const stats = await fs.promises.stat(path.join(cacheDir, file));
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      } catch {
        // file disappeared between readdir and stat
      }
    }
    _cacheStatsCache = { totalSize, fileCount };
    _cacheStatsExpiry = Date.now() + 60_000;
    return _cacheStatsCache;
  } catch {
    return { totalSize: 0, fileCount: 0 };
  }
}

/** Blocks private/loopback/metadata addresses to prevent SSRF. */
function isUrlSafeToProxy(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (/^(localhost|127\.|::1|0\.0\.0\.0)/.test(hostname)) return false;
    if (/^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (/^169\.254\./.test(hostname)) return false; // link-local (AWS/GCP/Azure metadata)
    return true;
  } catch {
    return false;
  }
}

export function setupRoutes(app: express.Express, io: SocketServer) {
  // Get Settings
  app.get("/api/settings", (req, res) => {
    const safeSettings = {
      ...settingsManager.settings,
      discordToken: settingsManager.settings.discordToken ? "••••••••••••••••••••" : "",
    };
    res.json(safeSettings);
  });

  // Save Settings
  app.post("/api/settings", async (req, res) => {
    try {
      logger.info({ body: req.body }, "Received settings update");
      const SettingsSchema = z.object({
        discordToken: z.string().optional(),
        channelId: z.string(),
        alertDuration: z.number().min(500).max(60000),
        syncDurationWithMedia: z.boolean(),
        bannedWords: z.array(z.string()),
        mediaMaxSizeMB: z.number().min(1).max(500),
        neonColor: z.string().regex(/^#/),
        alertStyle: z.enum(["neon", "glitch", "cyberpunk", "glass"]),
        bannedWordsAction: z.enum(["block", "censor"]),
        stopAlertShortcut: z.string(),
        youtubeCookiesContent: z.string().optional(),
        cooldownSeconds: z.number().min(0),
        blockLinks: z.boolean(),
        blockNSFW: z.boolean(),
        language: z.enum(["fr", "en", "uwu-fr", "uwu-en"]),
        alertSoundUrl: z.string().optional(),
        allowedRoleIds: z.array(z.string()).optional(),
        alertFont: z.enum(["sans", "mono", "serif", "display", "rounded"]).optional(),
        alertPosition: z
          .enum([
            "top-left",
            "top-center",
            "top-right",
            "center-left",
            "center",
            "center-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ])
          .optional(),
        alertScale: z.number().min(0.5).max(2).optional(),
        alertBgOpacity: z.number().min(0).max(1).optional(),
        alertAnimation: z.enum(["slide-up", "fade", "zoom", "bounce"]).optional(),
      });
      const incoming = SettingsSchema.parse(req.body);
      const originalToken = settingsManager.settings.discordToken;
      const originalChannel = settingsManager.settings.channelId;

      const updatedSettings = {
        ...settingsManager.settings,
        discordToken: incoming.discordToken === "••••••••••••••••••••" ? originalToken : incoming.discordToken || "",
        channelId: incoming.channelId || "",
        alertDuration: incoming.alertDuration || 8000,
        syncDurationWithMedia: incoming.syncDurationWithMedia ?? true,
        bannedWords: incoming.bannedWords || [],
        mediaMaxSizeMB: incoming.mediaMaxSizeMB || 8,
        neonColor: incoming.neonColor || "#6366f1",
        alertStyle: incoming.alertStyle || "neon",
        bannedWordsAction: incoming.bannedWordsAction || "censor",
        stopAlertShortcut: incoming.stopAlertShortcut || "Escape",
        youtubeCookiesContent: incoming.youtubeCookiesContent || "",
        cooldownSeconds: incoming.cooldownSeconds || 0,
        blockLinks: incoming.blockLinks || false,
        blockNSFW: incoming.blockNSFW || false,
        language: incoming.language || "fr",
        alertSoundUrl: incoming.alertSoundUrl || "",
        allowedRoleIds: incoming.allowedRoleIds || [],
        alertFont: incoming.alertFont || "sans",
        alertPosition: incoming.alertPosition || "bottom-left",
        alertScale: incoming.alertScale ?? 1,
        alertBgOpacity: incoming.alertBgOpacity ?? 0.9,
        alertAnimation: incoming.alertAnimation || "slide-up",
      };

      settingsManager.saveSettings(updatedSettings);

      if (updatedSettings.discordToken !== originalToken || updatedSettings.channelId !== originalChannel) {
        logger.info("Token or Channel ID altered: re-initialising Discord worker");
        botManager.connectBot(updatedSettings.discordToken, updatedSettings.channelId).catch((err) => {
          logger.error({ err }, "Discord worker re-initialization failed");
        });
      }

      res.json({
        success: true,
        settings: {
          ...updatedSettings,
          discordToken: updatedSettings.discordToken ? "••••••••••••••••••••" : "",
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        logger.error({ issues: err.issues }, "Validation failed for settings");
        res.status(400).json({ error: "Validation failed", details: (err as z.ZodError).issues });
        return;
      }
      logger.error({ err }, "Failed storing configurations");
      res.status(500).json({ error: err.message || "Failed storing configurations" });
    }
  });

  // Get Logs
  app.get("/api/logs", (req, res) => {
    res.json(logManager.logs);
  });

  // Clear Logs
  app.post("/api/logs/clear", (req, res) => {
    logManager.clearLogs();
    io.emit("logs_cleared");
    res.json({ success: true });
  });

  // Server logs (warn/error/fatal from pino)
  app.get("/api/server-logs", (req, res) => {
    res.json(serverLogManager.getLogs());
  });

  app.post("/api/server-logs/clear", (req, res) => {
    serverLogManager.clearLogs();
    io.emit("server_logs_cleared");
    res.json({ success: true });
  });

  // Bot Status/Reconnect
  app.get("/api/bot-status", async (req, res) => {
    const cacheStats = await getCacheStats();
    const ytDlpVersion = await getYtDlpVersion();

    // System stats
    const cpuUsage = os.loadavg()[0]; // 1 min load average
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    res.json({
      status: botManager.status,
      botUser: botManager.botUser,
      errorMsg: botManager.errorMsg,
      health: {
        cache: {
          size: cacheStats.totalSize,
          files: cacheStats.fileCount,
        },
        system: {
          cpu: cpuUsage,
          memory: {
            used: usedMem,
            total: totalMem,
          },
        },
        ytdlp: ytDlpVersion,
      },
    });
  });

  app.post("/api/media/retry", async (req, res) => {
    const { url, logId } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    try {
      logger.info({ url }, "Manually re-triggering extraction");

      // Calculate the hash of the URL to find potential cached files
      const urlHash = crypto.createHash("md5").update(url).digest("hex");
      const possibleCachedFile = path.join(process.cwd(), "media_cache", `${urlHash}.mp4`);

      // Clear any potentially cached failures or old versions
      if (fs.existsSync(possibleCachedFile)) {
        logger.info({ url, file: possibleCachedFile }, "Clearing cached file");
        await fs.promises
          .unlink(possibleCachedFile)
          .catch((err) => logger.warn({ err: err.message }, "Failed to delete cached file"));
      }

      const resolved = await resolveMediaFromLink(url);

      // If it was a log retry, we might want to update the log status if it was an error
      if (logId) {
        logManager.updateLog(logId, {
          status: "approved",
          reason: "Manual retry successful",
          mediaUrl: resolved.mediaUrl,
          type: resolved.type,
        });
      }

      res.json({ success: true, resolved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Retry failed" });
    }
  });

  app.post("/api/replay-alert", async (req, res) => {
    const { logId } = req.body;
    if (!logId) return res.status(400).json({ error: "logId required" });

    const log = logManager.logs.find((l) => l.id === logId);
    if (!log) return res.status(404).json({ error: "Log not found" });

    if (!log.mediaUrl) return res.status(400).json({ error: "Log has no mediaUrl to replay" });

    const replayPayload = {
      id: crypto.randomUUID(),
      authorName: log.author,
      authorAvatar: log.authorAvatar || "https://cdn.discordapp.com/embed/avatars/0.png",
      text: log.text,
      mediaUrl: log.mediaUrl,
      type: log.type,
      duration: settingsManager.settings.alertDuration,
      syncDurationWithMedia: settingsManager.settings.syncDurationWithMedia,
      neonColor: settingsManager.settings.neonColor,
      alertStyle: settingsManager.settings.alertStyle,
      stopAlertShortcut: settingsManager.settings.stopAlertShortcut || "Escape",
      alertSoundUrl: settingsManager.settings.alertSoundUrl || "",
      alertFont: settingsManager.settings.alertFont || "sans",
      alertPosition: settingsManager.settings.alertPosition || "bottom-left",
      alertScale: settingsManager.settings.alertScale ?? 1,
      alertBgOpacity: settingsManager.settings.alertBgOpacity ?? 0.9,
      alertAnimation: settingsManager.settings.alertAnimation || "slide-up",
      timestamp: Date.now(),
      isTest: true as const,
    };

    alertManager.addAlert(replayPayload);
    io.emit("new_alert", replayPayload);
    res.json({ success: true });
  });

  app.post("/api/bot-reconnect", async (req, res) => {
    try {
      await botManager.connectBot(settingsManager.settings.discordToken, settingsManager.settings.channelId);
      res.json({ success: true, status: botManager.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Reconnect triggered failure." });
    }
  });

  // Test Alerts
  app.post("/api/trigger-test", async (req, res) => {
    const { authorName, text, type, mediaUrl, alertStyle, neonColor, duration } = req.body ?? {};

    let finalType = type || "image";
    let finalMediaUrl =
      mediaUrl || "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1280&auto=format&fit=crop";
    let finalProvider: string | undefined;

    if (finalMediaUrl.startsWith("http://") || finalMediaUrl.startsWith("https://")) {
      try {
        // Use full resolver so social media URLs download locally (no iframes)
        const resolved = await resolveMediaFromLink(finalMediaUrl);
        if (resolved && resolved.mediaUrl) {
          finalMediaUrl = resolved.mediaUrl;
          finalType = resolved.type;
          finalProvider = resolved.provider;
        }
      } catch (err) {
        logger.error({ err }, "Failed to resolve test media URL");
      }
    }

    const testPayload = {
      id: crypto.randomUUID(),
      authorName: authorName || "Viewer_Random_99",
      authorAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=128&q=80",
      text: text || "Regardez ce clip que je viens de faire sur le stream !",
      mediaUrl: finalMediaUrl,
      type: finalType,
      provider: finalProvider,
      duration: duration || settingsManager.settings.alertDuration,
      syncDurationWithMedia: settingsManager.settings.syncDurationWithMedia,
      neonColor: neonColor || settingsManager.settings.neonColor,
      alertStyle: alertStyle || settingsManager.settings.alertStyle,
      stopAlertShortcut: settingsManager.settings.stopAlertShortcut || "Escape",
      alertSoundUrl: settingsManager.settings.alertSoundUrl || "",
      alertFont: settingsManager.settings.alertFont || "sans",
      alertPosition: settingsManager.settings.alertPosition || "bottom-left",
      alertScale: settingsManager.settings.alertScale ?? 1,
      alertBgOpacity: settingsManager.settings.alertBgOpacity ?? 0.9,
      alertAnimation: settingsManager.settings.alertAnimation || "slide-up",
      timestamp: Date.now(),
      isTest: true,
    };

    alertManager.addAlert(testPayload);
    io.emit("new_alert", testPayload);
    res.json({ success: true, payload: testPayload });
  });

  // Queue Management
  app.post("/api/skip-alert", (req, res) => {
    io.emit("skip_alert");
    res.json({ success: true });
  });

  app.post("/api/queue/clear", (req, res) => {
    alertManager.clearQueue();
    io.emit("clear_queue");
    res.json({ success: true });
  });

  app.post("/api/queue/pause", (_req, res) => {
    io.emit("pause_alert");
    res.json({ success: true });
  });

  app.post("/api/queue/resume", (_req, res) => {
    io.emit("resume_alert");
    res.json({ success: true });
  });

  app.post("/api/queue/seek", (req, res) => {
    const seconds = typeof req.body.seconds === "number" ? req.body.seconds : null;
    if (seconds === null || isNaN(seconds)) return res.status(400).json({ error: "seconds must be a number" });
    io.emit("seek_alert", { seconds });
    res.json({ success: true });
  });

  app.post("/api/queue/seek-absolute", (req, res) => {
    const seconds = typeof req.body.seconds === "number" ? req.body.seconds : null;
    if (seconds === null || isNaN(seconds) || seconds < 0) return res.status(400).json({ error: "seconds must be a non-negative number" });
    io.emit("seek_alert_absolute", { seconds });
    res.json({ success: true });
  });

  app.post("/api/queue/volume", (req, res) => {
    const v = typeof req.body.v === "number" ? Math.max(0, Math.min(1, req.body.v)) : null;
    if (v === null) return res.status(400).json({ error: "v must be a number between 0 and 1" });
    io.emit("set_volume", { v });
    res.json({ success: true });
  });

  app.post("/api/queue/force-update", (req, res) => {
    const queue: { id: string }[] = req.body.queue;
    if (!Array.isArray(queue)) return res.status(400).json({ error: "queue must be an array" });
    const orderedIds = queue.map((item) => item.id);
    alertManager.reorderQueue(orderedIds);
    io.emit("force_queue_update", alertManager.getAlerts());
    res.json({ success: true });
  });

  app.post("/api/queue/remove-item", (req, res) => {
    alertManager.removeAlert(req.body.id);
    io.emit("remove_queue_item", req.body.id);
    res.json({ success: true });
  });

  // Clear media cache
  app.post("/api/cache/clear", async (req, res) => {
    const cacheDir = path.join(process.cwd(), "media_cache");
    if (!fs.existsSync(cacheDir)) {
      _cacheStatsCache = null;
      return res.json({ success: true, deleted: 0 });
    }
    try {
      const files = await fs.promises.readdir(cacheDir);
      let deleted = 0;
      for (const file of files) {
        if (!file.endsWith(".tmp")) {
          try {
            await fs.promises.unlink(path.join(cacheDir, file));
            deleted++;
          } catch {
            /* ignore */
          }
        }
      }
      _cacheStatsCache = null;
      io.emit("cache_cleared", { deleted });
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to clear cache" });
    }
  });

  // Lightweight health ping
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: Math.floor(process.uptime()) });
  });

  // Serve local media files
  app.get("/api/media-cache/:filename", (req, res) => {
    const filename = req.params.filename;
    // ensure no directory traversal
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(400).send("Invalid filename");
    }
    const filepath = path.join(process.cwd(), "media_cache", filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).send("File not found");
    }

    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set CORS and other headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
    res.header("Accept-Ranges", "bytes");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filepath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(200, head);
      fs.createReadStream(filepath).pipe(res);
    }
  });

  // Proxy Media
  app.get("/api/proxy-media", (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("No URL provided");
    if (!isUrlSafeToProxy(targetUrl)) return res.status(400).send("URL not allowed");

    const client = targetUrl.startsWith("https") ? https : http;

    let headersFromUrl: any = {};
    if (req.query.headers) {
      try {
        const decoded = Buffer.from(req.query.headers as string, "base64").toString("utf-8");
        headersFromUrl = JSON.parse(decoded);
      } catch {
        logger.warn("Failed to parse headers from proxy-media URL");
      }
    }

    const options: any = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        Referer: targetUrl.includes("tiktok")
          ? "https://www.tiktok.com/"
          : targetUrl.includes("instagram")
            ? "https://www.instagram.com/"
            : undefined,
        Accept: "*/*",
        Connection: "keep-alive",
        ...headersFromUrl,
      },
    };

    if (req.headers.range) {
      options.headers["Range"] = req.headers.range;
    }

    const log = (msg: string) => logger.debug(msg);

    log(`[Proxy Media] Requesting: ${targetUrl}`);

    const proxyReq = client.get(targetUrl, options, (proxyRes: any) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        let redirectUrl = proxyRes.headers.location;
        if (redirectUrl) {
          if (!redirectUrl.startsWith("http")) {
            redirectUrl = new URL(redirectUrl, targetUrl).toString();
          }
          let newRedirectQuery = `?url=${encodeURIComponent(redirectUrl)}`;
          if (req.query.headers) {
            newRedirectQuery += `&headers=${req.query.headers}`;
          }
          res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            Location: `/api/proxy-media${newRedirectQuery}`,
            "Access-Control-Allow-Origin": "*",
          });
          return res.end();
        }
      }

      // Avoid forwarding problematic headers
      const headers = { ...proxyRes.headers };
      delete headers["access-control-allow-origin"];
      delete headers["access-control-allow-methods"];
      delete headers["access-control-allow-headers"];
      delete headers["access-control-expose-headers"];

      res.writeHead(proxyRes.statusCode || 200, {
        ...headers,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Range",
      });
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (e: any) => {
      logger.error({ err: e }, "Proxy request error");
      if (!res.headersSent) res.status(500).send("Proxy error");
    });

    req.on("close", () => {
      proxyReq.destroy();
    });
  });
}
