import { getLinkPreview } from "link-preview-js";
import youtubedl, { create as ytDlpCreate, update as ytDlpUpdateRaw } from "youtube-dl-exec";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { logger } from "./logger.js";

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
import axios from "axios";
import { normalizeToMp4 } from "./ffmpegNormalizer.js";
import { SIZE_LIMITS } from "./mediaWorkerQueue.js";

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

const COBALT_API = "https://api.cobalt.tools/";
const CACHE_DIR = path.join(process.cwd(), "media_cache");
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

    // Remove TTL-expired files first (skip .tmp — might be in-progress)
    for (const f of fileStats) {
      if (f.file.endsWith(".tmp")) continue;
      if (now - f.atime > CACHE_TTL_MS) {
        await fs.promises.unlink(f.filePath).catch(() => {});
        logger.info({ file: f.file }, "Cache TTL expired");
      }
    }

    // Then enforce max size (oldest-access first)
    const remaining = fileStats.filter(
      (f) => !f.file.endsWith(".tmp") && now - f.atime <= CACHE_TTL_MS && fs.existsSync(f.filePath)
    );
    remaining.sort((a, b) => a.atime - b.atime);
    let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);

    if (totalSize > MAX_CACHE_SIZE) {
      logger.info({ totalSizeMB: (totalSize / 1024 / 1024).toFixed(0) }, "Cache size limit cleanup");
      for (const f of remaining) {
        if (totalSize <= MAX_CACHE_SIZE) break;
        await fs.promises.unlink(f.filePath).catch(() => {});
        totalSize -= f.size;
        logger.info({ file: f.file }, "Cache evicted");
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
  type: "image" | "video" | "iframe" | "link";
  mediaUrl: string;
  provider?: string;
} {
  const lowercaseUrl = url.toLowerCase();

  if (/\.(jpg|jpeg|gif|png|webp|bmp)(\?.*)?$/i.test(lowercaseUrl)) {
    return { type: "image", mediaUrl: url };
  }

  if (/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(lowercaseUrl)) {
    return { type: "video", mediaUrl: url };
  }

  const ytRegex =
    /(?:youtube(?:-nocookie|-education)?\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|watch\?v=|shorts\/)|youtu\.be\/)([^"&?\s]{11})/i;
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

  return { type: "link", mediaUrl: url, provider: providerDefault };
}

async function fetchWithCobalt(url: string): Promise<string | null> {
  try {
    logger.info({ url }, "Cobalt attempting extraction");
    const response = await axios.post(
      COBALT_API,
      {
        url,
        videoQuality: "1080",
        filenamePattern: "basic",
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const { status, url: streamUrl, tunnel, picker } = response.data;

    if (status === "error") {
      throw new Error(response.data.error?.code || "Cobalt returned an error status");
    }

    // v10 uses "stream", "tunnel", or "redirect" for a ready-to-download URL
    if (streamUrl) return streamUrl;
    if (tunnel) return tunnel;
    // "picker" is returned for multi-file content (e.g. tweet with images)
    if (status === "picker" && picker?.[0]?.url) return picker[0].url;

    return null;
  } catch (err: any) {
    logger.warn({ err: err.message, url }, "Cobalt failed");
    return null;
  }
}

async function cacheMedia(url: string, originalUrl: string): Promise<string | null> {
  try {
    const hash = hashUrl(originalUrl);
    const rawFilename = `${hash}.mp4`;
    const rawFilepath = path.join(CACHE_DIR, rawFilename);
    const tempFilepath = `${rawFilepath}.tmp`;

    if (!fs.existsSync(rawFilepath)) {
      logger.info({ rawFilename }, "Downloading to cache");
      const response = await axios({ method: "get", url, responseType: "stream" });

      const contentLength = response.headers["content-length"];
      if (contentLength && Number(contentLength) > SIZE_LIMITS.video) {
        throw new Error(`Content-Length exceeds video size limit`);
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

      // Validate actual file size
      const stat = await fs.promises.stat(tempFilepath);
      if (stat.size > SIZE_LIMITS.video) {
        await fs.promises.unlink(tempFilepath).catch(() => {});
        throw new Error(`Downloaded file exceeds video size limit (${(stat.size / 1024 / 1024).toFixed(0)}MB)`);
      }

      await fs.promises.rename(tempFilepath, rawFilepath);
    } else {
      logger.info({ rawFilename }, "Cache hit");
    }

    const normFilename = await normalizeToMp4(rawFilepath, hash);
    return normFilename ?? rawFilename;
  } catch (err: any) {
    logger.error({ err: err.message, originalUrl }, "Cache download failed");
    fs.promises.unlink(path.join(CACHE_DIR, `${hashUrl(originalUrl)}.mp4.tmp`)).catch(() => {});
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

async function fetchWithYtDlp(url: string): Promise<{ filename: string; info: any } | null> {
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath);
  const hash = hashUrl(url);
  const rawFilename = `${hash}.mp4`;
  const rawFilepath = path.join(CACHE_DIR, rawFilename);
  // .tmp.mp4 — ends in .mp4 so yt-dlp doesn't append another extension after merging
  const tempFilepath = path.join(CACHE_DIR, `${hash}.tmp.mp4`);

  // 500 MB cap for yt-dlp downloads (Discord attachment limit stays at SIZE_LIMITS.video = 50MB)
  const maxMB = 500;

  const dlOptions: any = {
    noWarnings: true,
    noCheckCertificates: true,
    // Without ffmpeg, use pre-muxed format only (max ~720p). With ffmpeg, prefer 1080p merged.
    format: _ffmpegBin
      ? "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
      : "best[height<=1080][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    referer: "https://www.google.com/",
    geoBypass: true,
    forceIpv4: true,
    output: tempFilepath,
    maxFilesize: `${maxMB}M`,
    ...(_ffmpegBin && { mergeOutputFormat: "mp4", ffmpegLocation: path.dirname(_ffmpegBin) }),
  };

  if (hasCookies) {
    dlOptions.cookies = cookiesPath;
  }

  try {
    logger.info({ url }, "yt-dlp extracting");

    if (fs.existsSync(rawFilepath)) {
      logger.info({ rawFilename }, "Cache hit (yt-dlp)");
      const normFilename = `${hash}_norm.mp4`;
      const finalFilename = fs.existsSync(path.join(CACHE_DIR, normFilename)) ? normFilename : rawFilename;
      return { filename: finalFilename, info: { title: "Cached Video" } };
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

    const normFilename = await normalizeToMp4(rawFilepath, hash);
    return { filename: normFilename ?? rawFilename, info };
  } catch (err: any) {
    logger.warn({ err: err.message, url }, "yt-dlp failed");
    if (fs.existsSync(tempFilepath)) {
      await fs.promises.unlink(tempFilepath).catch(() => {});
    }
    return null;
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

// Platforms where yt-dlp/Cobalt should be attempted — iframes are never a fallback for these.
const DOWNLOADABLE_PLATFORMS = [
  "tiktok.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "clips.twitch.tv",
];

function isDownloadablePlatform(url: string): boolean {
  const lower = url.toLowerCase();
  return DOWNLOADABLE_PLATFORMS.some((p) => lower.includes(p));
}

export async function resolveMediaFromLink(url: string): Promise<{
  type: "image" | "video" | "iframe" | "link";
  mediaUrl: string;
  title?: string;
  duration?: number;
  provider?: string;
  ytDlpError?: string;
}> {
  const { provider: urlProvider } = parseMediaUrl(url);

  if (isDownloadablePlatform(url)) {
    const ytdlResult = await fetchWithYtDlp(url);
    if (ytdlResult) {
      logger.info({ ytdlTitle: ytdlResult.info.title }, "yt-dlp resolution title");
      return {
        type: "video",
        mediaUrl: `/api/media-cache/${ytdlResult.filename}`,
        title: ytdlResult.info.title || "Video",
        duration: ytdlResult.info.duration ? ytdlResult.info.duration * 1000 : undefined,
        provider: urlProvider,
      };
    }

    const cobaltStreamUrl = await fetchWithCobalt(url);
    if (cobaltStreamUrl) {
      logger.info("Cobalt resolution title: Video (Hardcoded)");
      const cachedFilename = await cacheMedia(cobaltStreamUrl, url);
      if (cachedFilename) {
        return {
          type: "video",
          mediaUrl: `/api/media-cache/${cachedFilename}`,
          title: "Video",
          provider: urlProvider,
        };
      }
    }
  }

  if (isDownloadablePlatform(url)) {
    logger.warn({ url }, "All extractors failed — media unavailable");
    return {
      type: "link",
      mediaUrl: url,
      provider: urlProvider,
      ytDlpError: "yt-dlp and Cobalt both failed — media unavailable",
    };
  }

  const quick = parseMediaUrl(url);
  if (quick.type === "iframe") {
    return { ...quick, title: "" };
  }

  try {
    const preview = (await getLinkPreview(url, {
      timeout: 3000,
      followRedirects: "follow",
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
