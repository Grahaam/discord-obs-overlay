import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";
import { FFMPEG_BIN, CACHE_DIR } from "./binaries.js";
const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Normalize media to H264/AAC/MP4 with faststart for OBS browser source compatibility.
 * Returns the normalized filename, or null if ffmpeg is unavailable or fails.
 * The input file is preserved; a new _norm.mp4 file is produced.
 */
export async function normalizeToMp4(inputPath: string, inputHash: string): Promise<string | null> {
  const outputFilename = `${inputHash}_norm.mp4`;
  const outputPath = path.join(CACHE_DIR, outputFilename);
  const tempOutput = `${outputPath}.tmp`;

  if (fs.existsSync(outputPath)) {
    return outputFilename;
  }

  return new Promise((resolve) => {
    const args = [
      "-i",
      inputPath,
      // Optional streams — won't fail on audio-less input (GIFs, silent videos)
      "-map",
      "0:v?",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      // Ensure even dimensions required by yuv420p
      "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      // MP4 faststart moves moov atom to front for instant playback
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-max_muxing_queue_size",
      "1024",
      "-f",
      "mp4",
      "-y",
      tempOutput,
    ];

    const ffmpeg = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let done = false;
    let stderrTail = "";

    ffmpeg.stderr!.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });

    const timer = setTimeout(() => {
      done = true;
      ffmpeg.kill(9);
      fs.promises.unlink(tempOutput).catch(() => {});
      logger.error({ file: path.basename(inputPath) }, "FFmpeg normalization timeout");
      resolve(null);
    }, FFMPEG_TIMEOUT_MS);

    ffmpeg.on("close", async (code) => {
      clearTimeout(timer);
      if (done) return;
      done = true;

      if (code === 0) {
        try {
          await fs.promises.rename(tempOutput, outputPath);
          logger.info({ outputFilename }, "FFmpeg normalization completed");
          resolve(outputFilename);
        } catch (err) {
          logger.error({ err }, "FFmpeg rename failed");
          fs.promises.unlink(tempOutput).catch(() => {});
          resolve(null);
        }
      } else {
        fs.promises.unlink(tempOutput).catch(() => {});
        logger.warn(
          { code, file: path.basename(inputPath), stderr: stderrTail.trim().split("\n").slice(-5).join(" | ") },
          "FFmpeg exit code non-zero"
        );
        resolve(null);
      }
    });

    ffmpeg.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      fs.promises.unlink(tempOutput).catch(() => {});
      if (err.code === "ENOENT") {
        logger.warn("FFmpeg not found — skipping normalization");
      } else {
        logger.error({ err: err.message }, "FFmpeg spawn error");
      }
      resolve(null);
    });
  });
}
