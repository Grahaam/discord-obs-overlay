import { getLinkPreview } from "link-preview-js";
import youtubedl from "youtube-dl-exec";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const PYTHON_PATH = process.env.PYTHON_BIN || "python3";
const ytDlp = youtubedl.create({ python: PYTHON_PATH });
import axios from "axios";
import { settingsManager } from "./settingsManager.js";

// Cobalt v10 API — https://github.com/imputnet/cobalt
const COBALT_API = "https://api.cobalt.tools/";
const CACHE_DIR = path.join(process.cwd(), "media_cache");
const MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB default

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export async function cleanupCache() {
  try {
    const files = await fs.promises.readdir(CACHE_DIR);
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(CACHE_DIR, file);
        const stats = await fs.promises.stat(filePath);
        return { file, filePath, size: stats.size, atime: stats.atimeMs };
      })
    );

    // Sort by access time (oldest first)
    fileStats.sort((a, b) => a.atime - b.atime);

    let totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);

    if (totalSize <= MAX_CACHE_SIZE) return;

    console.log(`[Cache] Cleanup started. Current size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    for (const f of fileStats) {
      if (totalSize <= MAX_CACHE_SIZE) break;

      // Don't delete .tmp files that might be currently downloading
      if (f.file.endsWith(".tmp")) continue;

      try {
        await fs.promises.unlink(f.filePath);
        totalSize -= f.size;
        console.log(`[Cache] Deleted old file: ${f.file}`);
      } catch (err) {
        console.warn(`[Cache] Failed to delete ${f.file}:`, err);
      }
    }

    console.log(`[Cache] Cleanup finished. New size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  } catch (err) {
    console.error("[Cache] Cleanup failed:", err);
  }
}

// Run cleanup every hour
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
        videoQuality: "720",
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
    const hash = crypto.createHash("md5").update(originalUrl).digest("hex");
    const filename = `${hash}.mp4`; // Assume mp4 for Cobalt/yt-dlp results
    const filepath = path.join(CACHE_DIR, filename);
    const tempFilepath = `${filepath}.tmp`;

    if (fs.existsSync(filepath)) {
      console.log(`[Cache] Hit: ${filename}`);
      return filename;
    }

    console.log(`[Cache] Downloading: ${url} -> ${filename}`);
    const response = await axios({
      method: "get",
      url: url,
      responseType: "stream",
    });

    const contentLength = response.headers["content-length"];
    if (contentLength && parseInt(contentLength, 10) > settingsManager.settings.mediaMaxSizeMB * 1024 * 1024) {
      throw new Error(`File size exceeds limit (${settingsManager.settings.mediaMaxSizeMB}MB)`);
    }

    const writer = fs.createWriteStream(tempFilepath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", async () => {
        try {
          await fs.promises.rename(tempFilepath, filepath);
          await cleanupCache(); // Run cleanup after new file is cached
          resolve(filename);
        } catch (err) {
          reject(err);
        }
      });
      writer.on("error", async (err) => {
        if (fs.existsSync(tempFilepath)) {
          await fs.promises.unlink(tempFilepath).catch(() => {});
        }
        reject(err);
      });
    });
  } catch (err: any) {
    console.error(`[Cache] Download failed: ${err.message}`);
    return null;
  }
}

async function fetchWithYtDlp(url: string): Promise<{ filename: string; info: any } | null> {
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath);
  const hash = crypto.createHash("md5").update(url).digest("hex");
  const filename = `${hash}.mp4`;
  const filepath = path.join(CACHE_DIR, filename);
  const tempFilepath = `${filepath}.tmp`;

  try {
    console.log(`[yt-dlp] Attempting extraction for: ${url}`);
    const dlOptions: any = {
      noWarnings: true,
      noCheckCertificates: true,
      format: "best[ext=mp4]/best",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      referer: "https://www.google.com/",
      geoBypass: true,
      forceIpv4: true,
      output: tempFilepath,
      maxFilesize: `${settingsManager.settings.mediaMaxSizeMB}M`,
    };

    if (hasCookies) {
      dlOptions.cookies = cookiesPath;
    }

    if (fs.existsSync(filepath)) {
      console.log(`[Cache] Hit (yt-dlp): ${filename}`);
      // Still need info for title/duration
      const info: any = await ytDlp(url, { ...dlOptions, dumpSingleJson: true, output: undefined });
      return { filename, info };
    }

    const info: any = await ytDlp(url, { ...dlOptions, dumpSingleJson: true });

    if (!fs.existsSync(tempFilepath)) {
      await ytDlp(url, dlOptions);
    }

    await fs.promises.rename(tempFilepath, filepath);
    await cleanupCache();

    return { filename, info };
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
    await ytDlp.exec("", ["--update"], { python: PYTHON_PATH });
    console.log("[yt-dlp] Update check completed.");
  } catch (err: any) {
    console.warn(`[yt-dlp] Update failed: ${err.message}`);
  }
}

export async function resolveMediaFromLink(url: string): Promise<{
  type: "image" | "video" | "iframe" | "link";
  mediaUrl: string;
  title?: string;
  duration?: number;
  provider?: string;
  ytDlpError?: string;
}> {
  const lowercaseUrl = url.toLowerCase();

  // Resolve the provider from the URL up-front so it is never lost,
  // even when yt-dlp or Cobalt download the media and change the mediaUrl.
  const { provider: urlProvider } = parseMediaUrl(url);

  // 1. Try yt-dlp first (Local-First)
  if (
    lowercaseUrl.includes("tiktok.com") ||
    lowercaseUrl.includes("instagram.com") ||
    lowercaseUrl.includes("twitter.com") ||
    lowercaseUrl.includes("x.com") ||
    lowercaseUrl.includes("youtube.com") ||
    lowercaseUrl.includes("youtu.be")
  ) {
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

  // 2. Fallback to Cobalt
  const cobaltUrl = await fetchWithCobalt(url);
  if (cobaltUrl) {
    const cachedFilename = await cacheMedia(cobaltUrl, url);
    if (cachedFilename) {
      return {
        type: "video",
        mediaUrl: `/api/media-cache/${cachedFilename}`,
        title: "Video",
        provider: urlProvider,
      };
    }
  }

  // 3. Fallback to link-preview-js for images/generic links
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
        // Try to cache this too? For now keep proxy fallback
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
  } catch (err) {
    console.warn("[MediaParser] link-preview-js retrieval timed out:", url);
  }

  return { ...quick, title: "" };
}
