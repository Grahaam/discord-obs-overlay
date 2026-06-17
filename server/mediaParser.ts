import youtubedl, { create as ytDlpCreate, update as ytDlpUpdateRaw } from "youtube-dl-exec";
import createMetascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperSpotify from "metascraper-spotify";
import metascraperYoutube from "metascraper-youtube";
import metascraperAmazon from "metascraper-amazon";
import metascraperUrl from "metascraper-url";
import metascraperLogo from "metascraper-logo";
import metascraperAuthor from "metascraper-author";
import { execFileSync, execFile } from "child_process";
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
import { resolveStandalone } from "./ytDlpBinary.js";

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

// Set by findBestYtDlpPath(): true only when the active binary is the bundled
// standalone copy in a writable dir, which is the only variant that supports
// `yt-dlp -U` self-update. venv (pip) / system (brew/apt) installs do not.
let _ytDlpIsStandalone = false;

function findBestYtDlpPath(): string | null {
  // Packaged: prefer the bundled, self-updating standalone binary.
  const standalone = resolveStandalone();
  if (standalone) {
    _ytDlpIsStandalone = standalone.updatable;
    logger.info({ ytDlp: standalone.path, updatable: standalone.updatable }, "Using bundled standalone yt-dlp");
    return standalone.path;
  }

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

let _ytDlpReady = false;

/** Whether the media engine (yt-dlp) has finished first-run extraction. */
export function isYtDlpReady(): boolean {
  return _ytDlpReady;
}

/**
 * Force the standalone yt-dlp to self-extract now (async, off the startup
 * path) so the first real media job isn't blocked by a ~10s+ extraction.
 * Always marks ready in `finally` so a hung/slow extraction can't wedge the
 * media queue forever.
 */
export async function warmUpYtDlp(): Promise<void> {
  try {
    if (_ytDlpCustomPath) {
      await new Promise<void>((resolve) => {
        execFile(_ytDlpCustomPath as string, ["--version"], { timeout: 120000 }, () => resolve());
      });
    }
  } finally {
    _ytDlpReady = true;
  }
}

const metascraper = createMetascraper([
  metascraperSpotify(),
  metascraperYoutube(),
  metascraperAmazon(),
  metascraperAuthor(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperImage(),
  metascraperUrl(),
  metascraperLogo(),
]);

async function fetchMetadata(targetUrl: string) {
  try {
    const response = await axios.get(targetUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      timeout: 10000,
    });
    const finalUrl = response.request?.res?.responseUrl || response.config.url || targetUrl;
    return await metascraper({ html: response.data, url: finalUrl });
  } catch (err: any) {
    logger.warn({ err: err.message, targetUrl }, "Metadata extraction failed");
    return null;
  }
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
  if (lowercaseUrl.includes("soundcloud.com")) providerDefault = "soundcloud";
  if (lowercaseUrl.includes("streamable.com")) providerDefault = "streamable";
  if (lowercaseUrl.includes("tumblr.com")) providerDefault = "tumblr";
  if (lowercaseUrl.includes("vimeo.com")) providerDefault = "vimeo";
  if (lowercaseUrl.includes("vk.com")) providerDefault = "vk";
  if (lowercaseUrl.includes("spotify.com")) providerDefault = "spotify";
  if (lowercaseUrl.includes("deezer.com")) providerDefault = "deezer";
  if (lowercaseUrl.includes("apple.com/music")) providerDefault = "apple-music";
  if (lowercaseUrl.includes("tidal.com")) providerDefault = "tidal";

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

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

/**
 * Resolve true media type from the server's Content-Type for URLs with no usable
 * file extension (e.g. bing `th/id` thumbnails, image/video CDNs). Without this,
 * yt-dlp's generic extractor "succeeds" on a bare image — downloading it and
 * wrapping it into an mp4, so an image plays as a re-encoded silent video.
 * SSRF-guarded via resolveDNSHost; returns null on any failure (caller falls through).
 */
async function sniffMediaType(url: string): Promise<{ kind: "image" | "video" | "audio"; ext: string } | null> {
  try {
    await resolveDNSHost(url);
    const resp = await axios.head(url, {
      timeout: 6000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const ct = String(resp.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (ct.startsWith("image/")) return { kind: "image", ext: MIME_EXT[ct] ?? "jpg" };
    if (ct.startsWith("video/")) return { kind: "video", ext: "mp4" };
    if (ct.startsWith("audio/")) return { kind: "audio", ext: MIME_EXT[ct] ?? "mp3" };
    return null;
  } catch {
    return null;
  }
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

  const isYouTube = /youtube\.com|youtu\.be|ytsearch/.test(url);

  // Step 1: Resolve metadata and canonical URL first (fast, skip download)
  // This handles search-to-video resolution and ensures we have the real URL for hashing.
  let metadata: any = null;
  try {
    const rawMetadata = await withTimeout(
      ytDlp(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        geoBypass: true,
        forceIpv4: true,
        skipDownload: true,
        // Extract from multiple player clients and merge their format lists.
        // A single client (e.g. android_vr) intermittently returns only
        // storyboard formats when YouTube throttles it, which fails format
        // selection with "Requested format is not available"; listing a
        // fallback client lets the real formats come through.
        ...(isYouTube && { extractorArgs: "youtube:player-client=default,android_vr", noCookies: true }),
        ...(!isYouTube && hasCookies && { cookies: cookiesPath }),
      }),
      YTDLP_TIMEOUT_MS,
      `metadata:${url}`
    );

    if (typeof rawMetadata === "string") {
      metadata = JSON.parse(rawMetadata);
    } else {
      metadata = rawMetadata;
    }

    // Playlist handling: if it's a playlist (common for ytsearch), extract the first entry
    if (metadata?._type === "playlist" && metadata.entries?.length > 0) {
      metadata = metadata.entries[0];
    }
  } catch (err: any) {
    logger.warn({ err: err.message, url }, "yt-dlp metadata extraction failed");
    return null;
  }

  if (!metadata) return null;

  // Use the canonical URL for hashing to share cache between searches/redirects
  const downloadUrl = metadata.webpage_url || metadata.original_url || url;
  const hash = hashUrl(downloadUrl);
  const rawFilename = `${hash}.mp4`;
  const rawFilepath = path.join(CACHE_DIR, rawFilename);
  const tempFilepath = path.join(CACHE_DIR, `${hash}.tmp.mp4`);

  if (fs.existsSync(rawFilepath)) {
    logger.info({ rawFilename, title: metadata.title }, "Cache hit (yt-dlp)");
    const normFilename = `${hash}_norm.mp4`;
    const finalFilename = fs.existsSync(path.join(CACHE_DIR, normFilename)) ? normFilename : rawFilename;
    return { filename: finalFilename, info: metadata };
  }

  // Step 2: Download the resolved URL
  const maxMB = 5000;
  const quality = settingsManager.settings.mediaQuality ?? "1080";
  const dlOptions: any = {
    noWarnings: true,
    noCheckCertificates: true,
    format: audioOnly
      ? `bestaudio[ext=m4a]/bestaudio/best`
      : _ffmpegBin
        ? `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`
        : `best[height<=${quality}][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best`,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ...(!downloadUrl.includes("x.com") && !downloadUrl.includes("twitter.com") && { referer: "https://www.google.com/" }),
    geoBypass: true,
    forceIpv4: true,
    output: tempFilepath,
    maxFilesize: `${maxMB}M`,
    noPart: true, // Avoid rename issues
    noSimulate: true, // Ensure download happens
    ...(_ffmpegBin && { mergeOutputFormat: "mp4", ffmpegLocation: path.dirname(_ffmpegBin) }),
    ...(isYouTube && { extractorArgs: "youtube:player-client=android_vr", noCookies: true }),
    ...(!isYouTube && hasCookies && { cookies: cookiesPath }),
  };

  try {
    logger.info({ downloadUrl, title: metadata.title }, "yt-dlp downloading");

    // Ensure CACHE_DIR exists and clean up any stale temp file
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(tempFilepath)) await fs.promises.unlink(tempFilepath).catch(() => {});

    await withTimeout(ytDlp(downloadUrl, dlOptions), YTDLP_TIMEOUT_MS, `download:${downloadUrl}`);

    if (!fs.existsSync(tempFilepath)) {
      throw new Error(`yt-dlp produced no output file (likely exceeds ${maxMB}MB limit)`);
    }

    const stat = await fs.promises.stat(tempFilepath);
    if (stat.size > maxMB * 1024 * 1024) {
      await fs.promises.unlink(tempFilepath).catch(() => {});
      throw new Error(`File size ${(stat.size / 1024 / 1024).toFixed(0)}MB exceeds ${maxMB}MB limit`);
    }

    await fs.promises.rename(tempFilepath, rawFilepath);
    await fs.promises.writeFile(`${rawFilepath}.info.json`, JSON.stringify(metadata), "utf8").catch(() => {});

    const isAudioOnly = metadata?.vcodec === "none" || audioOnly;
    const normFilename = await normalizeToMp4(rawFilepath, hash, isAudioOnly);
    return { filename: normFilename ?? rawFilename, info: metadata };
  } catch (err: any) {
    const rawMsg: string = err.message || err.stderr || String(err) || "";
    const tail = rawMsg.trim().split("\n").slice(-6).join(" | ");
    logger.warn({ url: downloadUrl, err: tail }, "yt-dlp download failed");
    if (fs.existsSync(tempFilepath)) await fs.promises.unlink(tempFilepath).catch(() => {});
    return null;
  }
}

export async function updateYtDlp(): Promise<void> {
  // `yt-dlp -U` self-update only works on a writable standalone PyInstaller
  // binary. Package-manager installs (our venv uses pip; a system binary may be
  // brew/apt) refuse with exit code 100 — keep them current via their own
  // manager (e.g. `pip install -U yt-dlp` in the venv), not here.
  if (_ytDlpCustomPath && !_ytDlpIsStandalone) {
    logger.info({ ytDlp: _ytDlpCustomPath }, "External yt-dlp (venv/system) — skipping self-update");
    return;
  }
  try {
    logger.info("yt-dlp checking for updates");
    if (_ytDlpCustomPath) {
      // Update the active standalone copy in place. ytDlpUpdateRaw() would run
      // `-U` against youtube-dl-exec's OWN bundled binary instead — read-only
      // inside a packaged app bundle, so it always fails (exit 1) and never
      // touches the copy we actually use.
      await new Promise<void>((resolve, reject) => {
        execFile(_ytDlpCustomPath as string, ["-U"], { timeout: 120000 }, (err, _stdout, stderr) => {
          if (err) reject(new Error(stderr?.trim() || err.message));
          else resolve();
        });
      });
    } else {
      // No custom path: youtube-dl-exec fallback binary — update via its own helper.
      await ytDlpUpdateRaw();
    }
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
  "spotify.com": ["si"],
  "deezer.com": ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"],
};

const MUSIC_DOMAINS = [
  "spotify.com",
  "deezer.com",
  "music.apple.com",
  "tidal.com",
  "napster.com",
  "pandora.com",
  "music.amazon.",
  "qobuz.com",
  "bandcamp.com",
  "audiomack.com",
  "mixcloud.com",
];

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
  thumbnailUrl?: string;
  title?: string;
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

  // Giphy pre-resolver: extract GIF ID and use direct CDN URL before hitting yt-dlp.
  // Pattern: giphy.com/gifs/some-slug-GIPHYID → https://media.giphy.com/media/GIPHYID/giphy.gif
  if (!isDirectMediaUrl && /giphy\.com\/(?:gifs|clips)\//.test(normalizedUrl)) {
    try {
      const slug = new URL(normalizedUrl).pathname.split("/").filter(Boolean).pop() ?? "";
      const giphyId = slug.includes("-") ? slug.split("-").pop()! : slug;
      if (giphyId) {
        const directGifUrl = `https://media.giphy.com/media/${giphyId}/giphy.gif`;
        const cachedFilename = await cacheMedia(directGifUrl, cleanedUrl, "gif");
        if (cachedFilename) {
          return { type: "image", mediaUrl: `/api/media-cache/${cachedFilename}`, title: "GIF", provider: "giphy" };
        }
      }
    } catch {
      /* fallthrough to yt-dlp */
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

  // Music platform to YouTube redirect pipeline
  const isMusicPlatform = MUSIC_DOMAINS.some((d) => normalizedUrl.includes(d));
  if (!isDirectMediaUrl && isMusicPlatform) {
    try {
      logger.info({ url: normalizedUrl }, "Music platform detected — attempting YouTube redirection");
      const metadata = await fetchMetadata(normalizedUrl);

      if (metadata && (metadata.title || metadata.author)) {
        const searchQuery = `${metadata.title || ""} ${metadata.author || ""}`.trim();

        if (!searchQuery || searchQuery.length < 3) {
          throw new Error("Could not extract meaningful metadata for search");
        }

        logger.info({ searchQuery, from: metadata }, "Redirecting music link to YouTube search");
        const searchResult = await fetchWithYtDlp(`ytsearch1:${searchQuery}`, true);
        if (searchResult) {
          return {
            type: "audio",
            mediaUrl: `/api/media-cache/${searchResult.filename}`,
            thumbnailUrl: metadata.image || undefined,
            title: searchResult.info.title || metadata.title || searchQuery,
            provider: urlProvider,
          };
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message, url: normalizedUrl }, "Music platform redirection failed");
      /* fallthrough to normal yt-dlp */
    }
  }

  // Extensionless direct media (e.g. bing th/id thumbnails): cache by Content-Type
  // BEFORE yt-dlp, otherwise yt-dlp's generic extractor wraps a bare image into an
  // mp4 and it plays as a silent video. Skip embeddable providers (youtube/tiktok/…
  // resolve to iframe) so their links still go through the normal yt-dlp path.
  if (!isDirectMediaUrl && parseMediaUrl(downloadUrl).type !== "iframe") {
    const sniffed = await sniffMediaType(downloadUrl);
    if (sniffed) {
      const cached = await cacheMedia(downloadUrl, cleanedUrl, sniffed.ext);
      if (cached) {
        const titleMap = { image: "Image", video: "Video", audio: "Audio" } as const;
        return {
          type: sniffed.kind,
          mediaUrl: `/api/media-cache/${cached}`,
          title: titleMap[sniffed.kind],
          provider: urlProvider,
        };
      }
    }
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
    const metadata = await fetchMetadata(url);

    if (metadata) {
      if (metadata.image) {
        return { type: "image", mediaUrl: metadata.image, title: metadata.title || "" };
      }
      return { type: "link", mediaUrl: metadata.url || url, title: metadata.title || "", provider: urlProvider };
    }
  } catch {
    logger.warn({ url }, "Metadata retrieval failed");
  }

  return { ...quick, title: "" };
}
