import { getLinkPreview } from "link-preview-js";
import youtubedl, { create as ytDlpCreate, update as ytDlpUpdateRaw } from "youtube-dl-exec";
import { execFileSync, spawn } from "child_process";
import { createRequire } from "module";
import { logger } from "./logger.js";
import { CACHE_DIR } from "./binaries.js";

const _require = createRequire(import.meta.url);
const _ffmpegStatic: string | null = (() => {
  try {
    return _require("ffmpeg-static") as string;
  } catch {
    return null;
  }
})();
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dns from "dns";
import net from "net";
import axios from "axios";
import { normalizeToMp4 } from "./ffmpegNormalizer.js";
import { SIZE_LIMITS } from "./mediaWorkerQueue.js";
import { settingsManager } from "./settingsManager.js";

async function resolveDNSHost(url: string): Promise<string> {
  const hostname = new URL(url).hostname;
  const { address } = await dns.promises.lookup(hostname);
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    // Block loopback, private, and link-local ranges
    if (
      parts[0] === 127 ||
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254)
    ) {
      throw new Error(`Blocked SSRF attempt to private address: ${address}`);
    }
  }
  return address;
}

function findBestYtDlpPath(): string | null {
  const isWin = process.platform === "win32";
  const venvBin = path.join(process.cwd(), ".venv", isWin ? "Scripts" : "bin", isWin ? "yt-dlp.exe" : "yt-dlp");
  if (fs.existsSync(venvBin)) {
    try {
      execFileSync(venvBin, ["--version"], { stdio: "ignore" });
      logger.info({ venvBin }, "Using venv yt-dlp binary");
      return venvBin;
    } catch {
      /* binary not found or not executable */
    }
  }
  try {
    const cmd = isWin ? "where" : "which";
    const found = execFileSync(cmd, ["yt-dlp"], { encoding: "utf8" }).trim().split("\n")[0].trim();
    if (found) {
      execFileSync(found, ["--version"], { stdio: "ignore" });
      logger.info({ systemBin: found }, "Using system yt-dlp binary");
      return found;
    }
  } catch {
    /* yt-dlp not on PATH */
  }
  logger.warn("Falling back to bundled yt-dlp binary (may fail on Python <3.10)");
  return null;
}

export const _ytDlpCustomPath = findBestYtDlpPath();
const ytDlp = _ytDlpCustomPath ? ytDlpCreate(_ytDlpCustomPath) : youtubedl;

function findSpotDlPath(): string | null {
  const isWin = process.platform === "win32";
  const venvBin = path.join(process.cwd(), ".venv", isWin ? "Scripts" : "bin", isWin ? "spotdl.exe" : "spotdl");
  if (fs.existsSync(venvBin)) {
    try {
      execFileSync(venvBin, ["--version"], { stdio: "ignore" });
      logger.info({ venvBin }, "Using venv spotdl binary");
      return venvBin;
    } catch {
      /* not executable */
    }
  }
  try {
    const cmd = isWin ? "where" : "which";
    const found = execFileSync(cmd, ["spotdl"], { encoding: "utf8" }).trim().split("\n")[0].trim();
    if (found) {
      execFileSync(found, ["--version"], { stdio: "ignore" });
      logger.info({ systemBin: found }, "Using system spotdl binary");
      return found;
    }
  } catch {
    /* spotdl not on PATH */
  }
  return null;
}

export const _spotDlPath = findSpotDlPath();
if (!_spotDlPath) {
  logger.info("spotdl not found — Spotify downloads will use yt-dlp (30s previews for free accounts)");
}

const _ffmpegBin: string | null = (() => {
  if (_ffmpegStatic) return _ffmpegStatic;
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const found = execFileSync(cmd, ["ffmpeg"], { encoding: "utf8" }).trim().split("\n")[0].trim();
    return found || null;
  } catch {
    return null;
  }
})();
if (!_ffmpegBin) {
  logger.warn("ffmpeg not found — yt-dlp will use pre-muxed formats only (max 720p)");
} else {
  logger.info({ ffmpegBin: _ffmpegBin }, "Using ffmpeg binary");
}

function hashUrl(url: string): string {
  return crypto.createHash("md5").update(url).digest("hex");
}

const YTDLP_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes

const MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function cleanupOrphanedTempFiles(): void {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const tmpFiles = files.filter((f) => f.includes(".tmp"));
    if (tmpFiles.length > 0) {
      logger.info({ count: tmpFiles.length }, "Removing orphaned .tmp files");
      for (const f of tmpFiles) {
        try {
          fs.unlinkSync(path.join(CACHE_DIR, f));
        } catch {
          // ignore per-file errors
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Orphan cleanup failed");
  }
}

export async function cleanupCache() {
  try {
    const files = await fs.promises.readdir(CACHE_DIR);
    const now = Date.now();

    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(CACHE_DIR, file);
        const stats = await fs.promises.stat(filePath);
        return { file, filePath, size: stats.size, atime: stats.atimeMs, mtime: stats.mtimeMs };
      })
    );

    const { getFrequentMediaFilenames } = await import("./db.js");
    const threshold = settingsManager.settings.mediaPersistentPlaysThreshold ?? 5;
    const frequent = getFrequentMediaFilenames(threshold);

    // Remove TTL-expired files first (skip .tmp and frequently-played files)
    for (const f of fileStats) {
      if (f.file.endsWith(".tmp")) continue;
      if (frequent.has(f.file)) continue;
      if (now - f.atime > CACHE_TTL_MS) {
        await fs.promises.unlink(f.filePath).catch(() => {});
        logger.info({ file: f.file }, "Cache TTL expired");
      }
    }

    // Then enforce max size — frequent files sorted last (evicted only if necessary)
    const remaining = fileStats.filter((f) => !f.file.endsWith(".tmp") && fs.existsSync(f.filePath));
    remaining.sort((a, b) => {
      const aFreq = frequent.has(a.file) ? 1 : 0;
      const bFreq = frequent.has(b.file) ? 1 : 0;
      if (aFreq !== bFreq) return aFreq - bFreq; // non-frequent first
      return a.atime - b.atime; // then oldest-access first
    });
    let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);

    if (totalSize > MAX_CACHE_SIZE) {
      logger.info({ totalSizeMB: (totalSize / 1024 / 1024).toFixed(0) }, "Cache size limit cleanup");
      for (const f of remaining) {
        if (totalSize <= MAX_CACHE_SIZE) break;
        await fs.promises.unlink(f.filePath).catch(() => {});
        totalSize -= f.size;
        logger.info({ file: f.file, frequent: frequent.has(f.file) }, "Cache evicted");
      }
    }
  } catch (err) {
    logger.error({ err }, "Cache cleanup failed");
  }
}

export function startMediaParser(): void {
  setInterval(cleanupCache, 60 * 60 * 1000);
}

export function parseMediaUrl(url: string): {
  type: "image" | "video" | "audio" | "iframe" | "link";
  mediaUrl: string;
  provider?: string;
} {
  const lowercaseUrl = url.toLowerCase();

  if (/\.(jpg|jpeg|gif|png|webp|bmp)(\?.*)?$/i.test(lowercaseUrl)) {
    return { type: "image", mediaUrl: url };
  }

  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(lowercaseUrl)) {
    return { type: "video", mediaUrl: url };
  }

  if (/\.(mp3|m4a|ogg|opus|flac|wav|aac)(\?.*)?$/i.test(lowercaseUrl)) {
    return { type: "audio", mediaUrl: url };
  }

  const ytRegex =
    /(?:(?:[a-z0-9-]+\.)?youtube(?:-nocookie|-education)?\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|watch\?v=|shorts\/)|youtu\.be\/)([^"&?\s]{11})/i;
  const ytMatch = url.match(ytRegex);
  if (ytMatch && ytMatch[1]) {
    return {
      type: "iframe",
      mediaUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&fs=0&disablekb=1`,
      provider: "youtube",
    };
  }

  const ttRegex = /tiktok\.com\/@[^/]+\/video\/(\d+)/i;
  const ttMatch = url.match(ttRegex);
  if (ttMatch && ttMatch[1]) {
    return { type: "iframe", mediaUrl: `https://www.tiktok.com/embed/v2/${ttMatch[1]}`, provider: "tiktok" };
  } else if (lowercaseUrl.includes("tiktok.com")) {
    return { type: "link", mediaUrl: url, provider: "tiktok" };
  }

  const igRegex = /instagram\.com\/(?:p|reels|reel)\/([a-zA-Z0-9_-]+)/i;
  const igMatch = url.match(igRegex);
  if (igMatch && igMatch[1]) {
    return { type: "iframe", mediaUrl: `https://www.instagram.com/p/${igMatch[1]}/embed`, provider: "instagram" };
  } else if (lowercaseUrl.includes("instagram.com")) {
    return { type: "link", mediaUrl: url, provider: "instagram" };
  }

  const twitchClipRegex = /(?:clips\.twitch\.tv\/|twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/i;
  const clipMatch = url.match(twitchClipRegex);
  if (clipMatch && clipMatch[1]) {
    return { type: "iframe", mediaUrl: `https://clips.twitch.tv/embed?clip=${clipMatch[1]}`, provider: "twitch" };
  }

  let providerDefault = "general";
  if (lowercaseUrl.includes("twitter.com") || lowercaseUrl.includes("x.com")) providerDefault = "twitter";
  if (lowercaseUrl.includes("twitch.tv")) providerDefault = "twitch";
  if (lowercaseUrl.includes("facebook.com")) providerDefault = "facebook";
  if (lowercaseUrl.includes("reddit.com") || lowercaseUrl.includes("v.redd.it")) providerDefault = "reddit";
  if (lowercaseUrl.includes("bsky.app")) providerDefault = "bluesky";
  if (lowercaseUrl.includes("bilibili.com") || lowercaseUrl.includes("b23.tv")) providerDefault = "bilibili";
  if (lowercaseUrl.includes("dailymotion.com")) providerDefault = "dailymotion";
  if (lowercaseUrl.includes("facebook.com") || lowercaseUrl.includes("fb.watch")) providerDefault = "facebook";
  if (lowercaseUrl.includes("loom.com")) providerDefault = "loom";
  if (lowercaseUrl.includes("pinterest.com") || lowercaseUrl.includes("pin.it")) providerDefault = "pinterest";
  if (lowercaseUrl.includes("open.spotify.com")) providerDefault = "spotify";
  if (lowercaseUrl.includes("deezer.com")) providerDefault = "deezer";
  if (lowercaseUrl.includes("soundcloud.com")) providerDefault = "soundcloud";
  if (lowercaseUrl.includes("streamable.com")) providerDefault = "streamable";
  if (lowercaseUrl.includes("tumblr.com")) providerDefault = "tumblr";
  if (lowercaseUrl.includes("vimeo.com")) providerDefault = "vimeo";
  if (lowercaseUrl.includes("vk.com")) providerDefault = "vk";

  return { type: "link", mediaUrl: url, provider: providerDefault };
}

async function fetchWithCobalt(url: string): Promise<string | null> {
  const cobaltUrl = settingsManager.settings.cobaltApiUrl?.trim() || "http://localhost:9000/";
  const cobaltKey = settingsManager.settings.cobaltApiKey?.trim() || "";
  try {
    logger.info({ url }, "Cobalt attempting extraction");
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (cobaltKey) headers["Authorization"] = `Api-Key ${cobaltKey}`;
    const response = await axios.post(
      cobaltUrl,
      { url, videoQuality: settingsManager.settings.mediaQuality || "1080", filenameStyle: "basic" },
      { headers, timeout: 15000 }
    );

    const { status, url: streamUrl, tunnel, picker } = response.data;

    if (status === "error") {
      throw new Error(response.data.error?.code || "Cobalt returned an error status");
    }

    // tunnel/redirect → url field; local-processing → tunnel[] array
    if (streamUrl) return streamUrl;
    if (tunnel) return Array.isArray(tunnel) ? (tunnel[0] ?? null) : tunnel;
    // "picker" is returned for multi-file content (e.g. tweet with images)
    if (status === "picker" && picker?.[0]?.url) return picker[0].url;

    return null;
  } catch (err: any) {
    logger.warn({ err: err.message, url }, "Cobalt failed");
    return null;
  }
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "ogg", "opus", "flac", "wav", "aac"]);

function getImageExt(url: string): string | null {
  const m = url.match(/\.(jpe?g|png|gif|webp)(\?|$)/i);
  if (!m) return null;
  return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
}

function getAudioExt(url: string): string | null {
  const m = url.match(/\.(mp3|m4a|ogg|opus|flac|wav|aac)(\?|$)/i);
  return m ? m[1].toLowerCase() : null;
}

async function cacheMedia(url: string, originalUrl: string, ext = "mp4"): Promise<string | null> {
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isAudio = AUDIO_EXTENSIONS.has(ext);
  try {
    const hash = hashUrl(originalUrl);
    const rawFilename = `${hash}.${ext}`;
    const rawFilepath = path.join(CACHE_DIR, rawFilename);
    const tempFilepath = `${rawFilepath}.tmp`;
    const sizeLimit = isImage ? SIZE_LIMITS.image : isAudio ? SIZE_LIMITS.video : SIZE_LIMITS.video;

    if (!fs.existsSync(rawFilepath)) {
      logger.info({ rawFilename }, "Downloading to cache");
      await resolveDNSHost(url);
      const response = await axios({
        method: "get",
        url,
        responseType: "stream",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const contentLength = response.headers["content-length"];
      if (contentLength && Number(contentLength) > sizeLimit) {
        throw new Error(`Content-Length exceeds size limit`);
      }

      const writer = fs.createWriteStream(tempFilepath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", async (err) => {
          fs.promises.unlink(tempFilepath).catch(() => {});
          reject(err);
        });
      });

      const stat = await fs.promises.stat(tempFilepath);
      if (stat.size === 0) {
        await fs.promises.unlink(tempFilepath).catch(() => {});
        throw new Error("Downloaded file is empty");
      }
      if (stat.size > sizeLimit) {
        await fs.promises.unlink(tempFilepath).catch(() => {});
        throw new Error(`Downloaded file exceeds size limit (${(stat.size / 1024 / 1024).toFixed(0)}MB)`);
      }

      await fs.promises.rename(tempFilepath, rawFilepath);
    } else {
      logger.info({ rawFilename }, "Cache hit");
    }

    if (isImage || isAudio) return rawFilename;
    const normFilename = await normalizeToMp4(rawFilepath, hash);
    return normFilename ?? rawFilename;
  } catch (err: any) {
    logger.error({ err: err.message, originalUrl }, "Cache download failed");
    fs.promises.unlink(path.join(CACHE_DIR, `${hashUrl(originalUrl)}.${ext}.tmp`)).catch(() => {});
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[yt-dlp] Timeout (${ms / 1000}s): ${label}`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function fetchWithYtDlp(url: string, audioOnly = false): Promise<{ filename: string; info: any } | null> {
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath);
  const hash = hashUrl(url);
  const rawFilename = `${hash}.mp4`;
  const rawFilepath = path.join(CACHE_DIR, rawFilename);
  // .tmp.mp4 — ends in .mp4 so yt-dlp doesn't append another extension after merging
  const tempFilepath = path.join(CACHE_DIR, `${hash}.tmp.mp4`);

  // 5000 MB cap for both yt-dlp and Cobalt downloads
  const maxMB = 5000;

  const quality = settingsManager.settings.mediaQuality ?? "1080";
  const dlOptions: any = {
    noWarnings: true,
    noCheckCertificates: true,
    format: audioOnly
      ? `bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio`
      : _ffmpegBin
        ? `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`
        : `best[height<=${quality}][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best`,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    // Twitter/X rejects google.com referer when downloading from video.twimg.com
    ...(!url.includes("x.com") && !url.includes("twitter.com") && { referer: "https://www.google.com/" }),
    geoBypass: true,
    forceIpv4: true,
    output: tempFilepath,
    maxFilesize: `${maxMB}M`,
    ...(_ffmpegBin && { mergeOutputFormat: "mp4", ffmpegLocation: path.dirname(_ffmpegBin) }),
  };

  // YouTube clients that support cookies require a GVS PO Token (not available here).
  // ANDROID_VR (the working fallback) explicitly rejects cookies. Skip for YouTube.
  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  if (hasCookies && !isYouTube) {
    dlOptions.cookies = cookiesPath;
  }

  try {
    logger.info({ url }, "yt-dlp extracting");

    if (fs.existsSync(rawFilepath)) {
      logger.info({ rawFilename }, "Cache hit (yt-dlp)");
      const normFilename = `${hash}_norm.mp4`;
      const finalFilename = fs.existsSync(path.join(CACHE_DIR, normFilename)) ? normFilename : rawFilename;
      const infoFilepath = `${rawFilepath}.info.json`;
      let cachedInfo: any = {};

      if (fs.existsSync(infoFilepath)) {
        try {
          cachedInfo = JSON.parse(await fs.promises.readFile(infoFilepath, "utf8"));
        } catch (err: any) {
          logger.warn({ err: err.message, infoFilepath }, "Failed to read cached yt-dlp metadata");
        }
      }

      if (!cachedInfo.title) {
        try {
          cachedInfo = await withTimeout(
            ytDlp(url, {
              noWarnings: true,
              noCheckCertificates: true,
              userAgent: dlOptions.userAgent,
              referer: dlOptions.referer,
              geoBypass: dlOptions.geoBypass,
              forceIpv4: dlOptions.forceIpv4,
              printJson: true,
              skipDownload: true,
            }),
            YTDLP_TIMEOUT_MS,
            url
          );
        } catch (err: any) {
          logger.warn({ err: err.message, url }, "yt-dlp metadata fetch failed for cached video");
        }
      }

      return { filename: finalFilename, info: cachedInfo };
    }

    const info: any = await withTimeout(ytDlp(url, { ...dlOptions, printJson: true }), YTDLP_TIMEOUT_MS, url);
    logger.info({ infoTitle: info?.title }, "yt-dlp download complete");

    if (!fs.existsSync(tempFilepath)) {
      // yt-dlp exited 0 but created no file — typically means --max-filesize was exceeded
      throw new Error(`yt-dlp produced no output file (video likely exceeds ${maxMB}MB limit)`);
    }

    // Validate actual size before accepting
    const stat = await fs.promises.stat(tempFilepath);
    if (stat.size > maxMB * 1024 * 1024) {
      await fs.promises.unlink(tempFilepath).catch(() => {});
      throw new Error(`File size ${(stat.size / 1024 / 1024).toFixed(0)}MB exceeds ${maxMB}MB limit`);
    }

    await fs.promises.rename(tempFilepath, rawFilepath);
    await fs.promises.writeFile(`${rawFilepath}.info.json`, JSON.stringify(info), "utf8").catch(() => {});

    const isAudioOnly = info?.vcodec === "none";
    const normFilename = await normalizeToMp4(rawFilepath, hash, isAudioOnly);
    return { filename: normFilename ?? rawFilename, info };
  } catch (err: any) {
    const rawMsg: string = err.message || err.stderr || String(err) || "";
    const tail = rawMsg.trim().split("\n").slice(-6).join(" | ");
    logger.warn(
      {
        url,
        err: tail || "(empty — likely bot detection or PO token required)",
        hasCookies,
        isYouTube,
      },
      "yt-dlp failed"
    );
    if (fs.existsSync(tempFilepath)) {
      await fs.promises.unlink(tempFilepath).catch(() => {});
    }
    return null;
  }
}

async function fetchWithSpotDl(url: string): Promise<{ filename: string; info: any } | null> {
  if (!_spotDlPath) return null;

  const hash = hashUrl(url);
  const finalFilename = `${hash}.mp3`;
  const finalPath = path.join(CACHE_DIR, finalFilename);
  const metaPath = `${finalPath}.info.json`;

  if (fs.existsSync(finalPath)) {
    logger.info({ finalFilename }, "Cache hit (spotdl)");
    let info: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        info = JSON.parse(await fs.promises.readFile(metaPath, "utf8"));
      } catch {
        /* ignore malformed metadata */
      }
    }
    return { filename: finalFilename, info };
  }

  return new Promise((resolve) => {
    logger.info({ url }, "spotdl downloading");

    // spotdl appends the format extension to the output template path
    const outputTemplate = path.join(CACHE_DIR, hash);
    const tmpPath = `${outputTemplate}.mp3`;

    const args = [
      "download",
      url,
      "--output",
      outputTemplate,
      "--format",
      "mp3",
      "--no-config",
      "--print-errors",
    ];

    const proc = spawn(_spotDlPath!, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: any) => (stdout += d.toString()));
    proc.stderr?.on("data", (d: any) => (stderr += d.toString()));

    const killTimer = setTimeout(() => {
      proc.kill();
      logger.warn({ url }, "spotdl timed out");
      resolve(null);
    }, 120_000);

    proc.on("close", async (code: number | null) => {
      clearTimeout(killTimer);

      if (code !== 0 || !fs.existsSync(tmpPath)) {
        logger.warn({ url, code, stderr: stderr.slice(-300) }, "spotdl failed or produced no file");
        resolve(null);
        return;
      }

      // Parse artist and title from spotdl stdout: "Downloaded "{title}" by {artist}"
      let title: string | undefined;
      let artist: string | undefined;
      const dlMatch = stdout.match(/Downloaded\s+"([^"]+?)"\s+by\s+(.+?)[\r\n]/i);
      if (dlMatch) {
        title = dlMatch[1].trim();
        artist = dlMatch[2].trim();
      } else {
        // Fallback: "Downloaded "{title}""
        const titleMatch = stdout.match(/Downloaded\s+"([^"]+?)"/i);
        if (titleMatch) title = titleMatch[1].trim();
      }

      try {
        await fs.promises.rename(tmpPath, finalPath);
        const info = { title, artist, provider: "spotify", vcodec: "none" };
        await fs.promises.writeFile(metaPath, JSON.stringify(info), "utf8").catch(() => {});
        logger.info({ finalFilename, title, artist }, "spotdl download complete");
        resolve({ filename: finalFilename, info });
      } catch (err: any) {
        logger.error({ err: err.message, url }, "spotdl post-processing failed");
        resolve(null);
      }
    });
  });
}

async function cacheAlbumArt(thumbnailUrl: string | undefined, cacheKey: string): Promise<string | undefined> {
  if (!thumbnailUrl) return undefined;
  try {
    const ext = getImageExt(thumbnailUrl) || "jpg";
    const cached = await cacheMedia(thumbnailUrl, `${cacheKey}_albumart`, ext);
    return cached ? `/api/media-cache/${cached}` : undefined;
  } catch {
    return undefined;
  }
}

export async function updateYtDlp(): Promise<void> {
  try {
    logger.info("yt-dlp checking for updates");
    await (_ytDlpCustomPath ? ytDlpUpdateRaw(_ytDlpCustomPath) : ytDlpUpdateRaw());
    logger.info("yt-dlp update check completed");
  } catch (err: any) {
    logger.warn({ err: err.message }, "yt-dlp update failed");
  }
}

function parseCookiesForDomain(cookiesPath: string, domain: string): string {
  try {
    const now = Date.now() / 1000;
    return fs
      .readFileSync(cookiesPath, "utf8")
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.trim())
      .map((l) => l.split("\t"))
      .filter((p) => p.length >= 7 && p[0].includes(domain) && Number(p[4]) > now)
      .map((p) => `${p[5]}=${p[6].trim()}`)
      .join("; ");
  } catch {
    return "";
  }
}

async function resolveRedditPostMediaUrl(postUrl: string, cookiesPath: string): Promise<string | null> {
  const cookie = parseCookiesForDomain(cookiesPath, "reddit.com");
  try {
    const parsed = new URL(postUrl);
    const jsonUrl = `https://www.reddit.com${parsed.pathname.replace(/\/$/, "")}.json`;
    const reqHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
    if (cookie) reqHeaders["Cookie"] = cookie;
    const { data } = await axios.get(jsonUrl, {
      headers: reqHeaders,
      timeout: 6000,
    });
    const post = data[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    // Video post
    if (post.is_video) {
      const previewVideo = post.preview?.reddit_video_preview?.fallback_url;
      return post.media?.reddit_video?.fallback_url ?? previewVideo ?? null;
    }

    // Gallery post — use i.redd.it/{id}.{ext} (CDN, no auth required)
    if (post.is_gallery && post.gallery_data?.items?.length > 0) {
      const meta: Record<string, any> = post.media_metadata ?? {};
      for (const item of post.gallery_data.items) {
        const entry = meta[item.media_id];
        if (!entry) continue;
        if (entry.e === "AnimatedImage" && entry.s?.mp4) return entry.s.mp4;
        if (entry.e === "Image" && entry.m) {
          const ext = (entry.m as string).split("/")[1] || "jpg";
          return `https://i.redd.it/${item.media_id}.${ext}`;
        }
      }
    }

    // Single image post
    if (post.post_hint === "image" && post.url) return post.url as string;

    // Animated image in media_metadata (non-gallery)
    for (const item of Object.values(post.media_metadata ?? {}) as any[]) {
      if (item.e === "AnimatedImage" && item.s?.mp4) return item.s.mp4;
    }

    return null;
  } catch {
    return null;
  }
}

const TRACKING_PARAMS: Record<string, string[]> = {
  "x.com": ["s", "t", "src", "ref_src", "ref_url"],
  "twitter.com": ["s", "t", "src", "ref_src", "ref_url"],
  "youtube.com": ["si", "feature", "pp"],
  "youtu.be": ["si", "feature"],
  "tiktok.com": ["is_from_webapp", "sender_device", "web_id"],
  "instagram.com": ["igsh", "igshid"],
  "reddit.com": ["utm_source", "utm_medium", "utm_campaign", "utm_name", "utm_content", "utm_term", "share_id"],
};

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const paramsToStrip =
      Object.entries(TRACKING_PARAMS).find(([domain]) => parsed.hostname.endsWith(domain))?.[1] ?? [];
    for (const p of paramsToStrip) parsed.searchParams.delete(p);
    return parsed.toString();
  } catch {
    return url;
  }
}

// Rewrite subdomain variants to the canonical domain that yt-dlp and Cobalt handle best.
// audioOnly: true forces bestaudio-only extraction and marks the result as type "audio".
const CANONICAL_HOSTS: Array<{ pattern: RegExp; canonical: string; audioOnly?: boolean }> = [
  { pattern: /^(?!www\.)[a-z0-9-]+\.youtube\.com$/, canonical: "www.youtube.com", audioOnly: true },
];

function normalizeForExtraction(url: string): { url: string; audioOnly: boolean } {
  try {
    const parsed = new URL(url);
    for (const { pattern, canonical, audioOnly } of CANONICAL_HOSTS) {
      if (pattern.test(parsed.hostname)) {
        parsed.hostname = canonical;
        return { url: parsed.toString(), audioOnly: audioOnly ?? false };
      }
    }
    return { url, audioOnly: false };
  } catch {
    return { url, audioOnly: false };
  }
}

export async function resolveMediaFromLink(url: string): Promise<{
  type: "image" | "video" | "audio" | "iframe" | "link";
  mediaUrl: string;
  title?: string;
  artist?: string;
  albumArt?: string;
  duration?: number;
  provider?: string;
  ytDlpError?: string;
}> {
  const { provider: urlProvider } = parseMediaUrl(url);
  const cleanedUrl = cleanUrl(url);
  const cookiesPath = path.join(process.cwd(), "cookies.txt");

  const { url: normalizedUrl, audioOnly: isAudioOrigin } = normalizeForExtraction(cleanedUrl);

  // Fast path: direct media by file extension — skip yt-dlp/Cobalt overhead.
  // Track image/audio to prevent fallthrough into yt-dlp: its generic extractor downloads
  // images and ffmpeg wraps them in .mp4, producing type:"video" for an image URL.
  const directImgExt = getImageExt(normalizedUrl);
  if (directImgExt) {
    const cached = await cacheMedia(normalizedUrl, cleanedUrl, directImgExt);
    if (cached) return { type: "image", mediaUrl: `/api/media-cache/${cached}`, title: "Image", provider: urlProvider };
    // cacheMedia failed (403, 404, etc.) — skip yt-dlp/Cobalt, fall to link-preview below
  }
  const directAudioExt = !directImgExt ? getAudioExt(normalizedUrl) : null;
  if (directAudioExt) {
    const cached = await cacheMedia(normalizedUrl, cleanedUrl, directAudioExt);
    if (cached) return { type: "audio", mediaUrl: `/api/media-cache/${cached}`, title: "Audio", provider: urlProvider };
    // cacheMedia failed — skip yt-dlp/Cobalt, fall to link-preview below
  }
  const isDirectMediaUrl = !!(directImgExt || directAudioExt);

  if (!isDirectMediaUrl) {
    const directVideoMatch = normalizedUrl.match(/\.(mp4|webm|mov)(\?|$)/i);
    if (directVideoMatch) {
      const ext = directVideoMatch[1].toLowerCase();
      const cached = await cacheMedia(normalizedUrl, cleanedUrl, ext);
      if (cached)
        return { type: "video", mediaUrl: `/api/media-cache/${cached}`, title: "Video", provider: urlProvider };
      // cacheMedia failed for direct video — allow yt-dlp fallthrough (may handle auth/redirects)
    }
  }

  // Reddit pre-resolver: extract direct media URL before hitting yt-dlp
  let downloadUrl = normalizedUrl;
  if (!isDirectMediaUrl && /reddit\.com\/r\/[^/]+\/comments\//.test(url)) {
    const redditMediaUrl = await resolveRedditPostMediaUrl(cleanedUrl, cookiesPath);
    if (redditMediaUrl) {
      logger.info({ redditMediaUrl }, "Reddit post pre-resolved to direct media URL");
      const imgExt = getImageExt(redditMediaUrl);
      if (imgExt) {
        const cachedFilename = await cacheMedia(redditMediaUrl, cleanedUrl, imgExt);
        if (cachedFilename) {
          return {
            type: "image",
            mediaUrl: `/api/media-cache/${cachedFilename}`,
            title: "Image",
            provider: urlProvider,
          };
        }
      }
      downloadUrl = redditMediaUrl;
    }
  }

  // Spotify / Deezer: audio-only download with spotdl (Spotify) or yt-dlp bestaudio (Deezer)
  const isSpotify = /open\.spotify\.com\/(track|album|playlist)\//.test(normalizedUrl);
  const isDeezer = /(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(?:track|album|playlist)\//.test(normalizedUrl);

  if (isSpotify || isDeezer) {
    const musicProvider = isSpotify ? "spotify" : "deezer";
    let musicResult: { filename: string; info: any } | null = null;

    if (isSpotify) {
      musicResult = await fetchWithSpotDl(normalizedUrl);
    }

    if (!musicResult) {
      musicResult = await fetchWithYtDlp(normalizedUrl, true);
    }

    if (musicResult) {
      const { filename, info } = musicResult;
      const artist: string | undefined = info.artist || info.uploader || undefined;
      const albumArt = await cacheAlbumArt(info.thumbnail || info.cover_url, cleanedUrl);
      return {
        type: "audio",
        mediaUrl: `/api/media-cache/${filename}`,
        title: info.title || "Music Track",
        artist,
        albumArt,
        provider: musicProvider,
      };
    }

    return {
      type: "link",
      mediaUrl: normalizedUrl,
      title: "",
      provider: musicProvider,
      ytDlpError: "Music download failed — try adding cookies or installing spotdl for Spotify",
    };
  }

  const ytdlResult = await fetchWithYtDlp(downloadUrl, isAudioOrigin);
  if (ytdlResult) {
    logger.info({ ytdlTitle: ytdlResult.info.title }, "yt-dlp resolution title");
    const isImg = !!getImageExt(ytdlResult.filename);
    // vcodec === "none": yt-dlp selected audio-only stream; isAudioOrigin: music platform forced bestaudio
    const isAudio = !isImg && (ytdlResult.info.vcodec === "none" || isAudioOrigin);
    const mediaType = isImg ? "image" : isAudio ? "audio" : "video";
    return {
      type: mediaType,
      mediaUrl: `/api/media-cache/${ytdlResult.filename}`,
      title: ytdlResult.info.title || (isImg ? "Image" : isAudio ? "Audio" : "Video"),
      duration: isImg || isAudio ? undefined : ytdlResult.info.duration ? ytdlResult.info.duration * 1000 : undefined,
      provider: urlProvider,
    };
  }

  const cobaltStreamUrl = await fetchWithCobalt(downloadUrl);
  if (cobaltStreamUrl) {
    logger.info("Cobalt resolved media");
    const cobaltExt = getImageExt(cobaltStreamUrl) ?? getAudioExt(cobaltStreamUrl) ?? "mp4";
    const cachedFilename = await cacheMedia(cobaltStreamUrl, cleanedUrl, cobaltExt);
    if (cachedFilename) {
      const isImg = !!getImageExt(cachedFilename);
      const isAud = !!getAudioExt(cachedFilename);
      return {
        type: isImg ? "image" : isAud ? "audio" : "video",
        mediaUrl: `/api/media-cache/${cachedFilename}`,
        title: isImg ? "Image" : isAud ? "Audio" : "Video",
        provider: urlProvider,
      };
    }
  }

  const quick = parseMediaUrl(url);
  if (quick.type === "iframe") {
    return { ...quick, title: "" };
  }

  try {
    const preview = (await getLinkPreview(url, {
      timeout: 3000,
      followRedirects: "follow",
      resolveDNSHost,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
      },
    })) as any;

    if (preview) {
      const contentType = (preview.contentType || "").toLowerCase();
      const mediaType = (preview.mediaType || "").toLowerCase();

      if (contentType.startsWith("image/") || mediaType === "image" || mediaType === "image.generic") {
        return { type: "image", mediaUrl: preview.url || url, title: preview.title || "" };
      }

      if (contentType.startsWith("video/") || mediaType === "video" || mediaType === "video.other") {
        const rawUrl = preview.url || url;
        return {
          type: "video",
          mediaUrl: `/api/proxy-media?url=${encodeURIComponent(rawUrl)}`,
          title: preview.title || "",
        };
      }

      if (preview.images && preview.images.length > 0) {
        return { type: "image", mediaUrl: preview.images[0], title: preview.title || "" };
      }
    }
  } catch {
    logger.warn({ url }, "link-preview-js retrieval timed out");
  }

  return { ...quick, title: "" };
}
