import { getLinkPreview } from "link-preview-js";
import youtubedl from "youtube-dl-exec";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import { normalizeToMp4 } from "./ffmpegNormalizer.js";
import { SIZE_LIMITS } from "./mediaWorkerQueue.js";

const ytDlp = youtubedl;

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
    const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
    if (tmpFiles.length > 0) {
      console.log(`[Cache] Removing ${tmpFiles.length} orphaned .tmp files`);
      for (const f of tmpFiles) {
        try {
          fs.unlinkSync(path.join(CACHE_DIR, f));
        } catch {
          // ignore per-file errors
        }
      }
    }
  } catch (err) {
    console.error("[Cache] Orphan cleanup failed:", err);
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
        console.log(`[Cache] TTL expired: ${f.file}`);
      }
    }

    // Then enforce max size (oldest-access first)
    const remaining = fileStats.filter(
      (f) => !f.file.endsWith(".tmp") && now - f.atime <= CACHE_TTL_MS && fs.existsSync(f.filePath)
    );
    remaining.sort((a, b) => a.atime - b.atime);
    let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);

    if (totalSize > MAX_CACHE_SIZE) {
      console.log(`[Cache] Size limit cleanup: ${(totalSize / 1024 / 1024).toFixed(0)}MB`);
      for (const f of remaining) {
        if (totalSize <= MAX_CACHE_SIZE) break;
        await fs.promises.unlink(f.filePath).catch(() => {});
        totalSize -= f.size;
        console.log(`[Cache] Evicted: ${f.file}`);
      }
    }
  } catch (err) {
    console.error("[Cache] Cleanup failed:", err);
  }
}

setInterval(cleanupCache, 60 * 60 * 1000);

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
    console.log(`[Cobalt] Attempting extraction for: ${url}`);
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
    console.warn(`[Cobalt] Failed: ${err.message}`);
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
      console.log(`[Cache] Downloading: ${rawFilename}`);
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
      console.log(`[Cache] Hit: ${rawFilename}`);
    }

    const normFilename = await normalizeToMp4(rawFilepath, hash);
    return normFilename ?? rawFilename;
  } catch (err: any) {
    console.error(`[Cache] Download failed: ${err.message}`);
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
  const tempFilepath = `${rawFilepath}.tmp`;

  // Hard cap at 50MB (per SIZE_LIMITS.video). The user-facing mediaMaxSizeMB setting
  // is intentionally NOT applied here — it was designed for Discord attachments, not
  // downloads. Applying it to yt-dlp was silently forcing low quality on long videos.
  const maxMB = Math.round(SIZE_LIMITS.video / (1024 * 1024)); // 50MB

  const dlOptions: any = {
    noWarnings: true,
    noCheckCertificates: true,
    // Prefer 1080p H264+AAC for OBS compatibility. Falls back progressively.
    format:
      "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    referer: "https://www.google.com/",
    geoBypass: true,
    forceIpv4: true,
    output: tempFilepath,
    maxFilesize: `${maxMB}M`,
    mergeOutputFormat: "mp4",
  };

  if (hasCookies) {
    dlOptions.cookies = cookiesPath;
  }

  try {
    console.log(`[yt-dlp] Extracting: ${url}`);

    if (fs.existsSync(rawFilepath)) {
      console.log(`[Cache] Hit (yt-dlp): ${rawFilename}`);
      const normFilename = `${hash}_norm.mp4`;
      const finalFilename = fs.existsSync(path.join(CACHE_DIR, normFilename)) ? normFilename : rawFilename;
      return { filename: finalFilename, info: {} };
    }

    const info: any = await withTimeout(ytDlp(url, { ...dlOptions, dumpSingleJson: true }), YTDLP_TIMEOUT_MS, url);

    if (!fs.existsSync(tempFilepath)) {
      await withTimeout(ytDlp(url, dlOptions), YTDLP_TIMEOUT_MS, url);
    }

    // Validate size before accepting
    if (fs.existsSync(tempFilepath)) {
      const stat = await fs.promises.stat(tempFilepath);
      if (stat.size > SIZE_LIMITS.video) {
        await fs.promises.unlink(tempFilepath).catch(() => {});
        throw new Error(`File size ${(stat.size / 1024 / 1024).toFixed(0)}MB exceeds video limit`);
      }
    }

    await fs.promises.rename(tempFilepath, rawFilepath);

    const normFilename = await normalizeToMp4(rawFilepath, hash);
    return { filename: normFilename ?? rawFilename, info };
  } catch (err: any) {
    console.warn(`[yt-dlp] Failed: ${err.message}`);
    if (fs.existsSync(tempFilepath)) {
      await fs.promises.unlink(tempFilepath).catch(() => {});
    }
    return null;
  }
}

export async function updateYtDlp(): Promise<void> {
  try {
    console.log("[yt-dlp] Checking for updates...");
    // youtube-dl-exec doesn't have a direct update() method, so we run the command
    await ytDlp.exec("yt-dlp", { update: true });
    console.log("[yt-dlp] Update check completed.");
  } catch (err: any) {
    console.warn(`[yt-dlp] Update failed: ${err.message}`);
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
      return {
        type: "video",
        mediaUrl: `/api/media-cache/${ytdlResult.filename}`,
        title: ytdlResult.info.title || "Video",
        duration: ytdlResult.info.duration ? ytdlResult.info.duration * 1000 : undefined,
        provider: urlProvider,
      };
    }
  }

  const cobaltStreamUrl = await fetchWithCobalt(url);
  if (cobaltStreamUrl) {
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

  if (isDownloadablePlatform(url)) {
    console.warn(`[MediaParser] All extractors failed for ${url} — refusing iframe fallback`);
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
    console.warn("[MediaParser] link-preview-js retrieval timed out:", url);
  }

  return { ...quick, title: "" };
}
