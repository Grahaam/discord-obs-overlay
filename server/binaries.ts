import { createRequire } from "module";
import { execFileSync } from "child_process";
import path from "path";
import { logger } from "./logger.js";

const _require = createRequire(import.meta.url);

export const CACHE_DIR = path.join(process.cwd(), "media_cache");

export const FFMPEG_BIN: string = (() => {
  // Try ffmpeg-static first
  try {
    const bin = _require("ffmpeg-static") as string | null;
    if (bin) {
      logger.info({ ffmpegBin: bin }, "Using ffmpeg binary (ffmpeg-static)");
      return bin;
    }
  } catch {
    /* not installed */
  }
  // Try system ffmpeg
  for (const cmd of ["which", "where"]) {
    try {
      const found = execFileSync(cmd, ["ffmpeg"], { encoding: "utf8" }).trim().split("\n")[0].trim();
      if (found) {
        logger.info({ ffmpegBin: found }, "Using ffmpeg binary (system)");
        return found;
      }
    } catch {
      /* not found */
    }
  }
  logger.warn("ffmpeg not found — yt-dlp will use pre-muxed formats only (max 720p)");
  return "ffmpeg"; // fallback: hope it's on PATH
})();
