import PQueue from "p-queue";
import { logger } from "./logger.js";

const MAX_QUEUE_SIZE = 50;

const mediaQueue = new PQueue({ concurrency: 4, autoStart: false });

// Per-type file size limits in bytes
export const SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB
  gif: 25 * 1024 * 1024, // 25MB
  video: 5000 * 1024 * 1024, // 5000MB
  audio: 15 * 1024 * 1024, // 15MB
};

/** Begin processing queued media jobs. Called once the yt-dlp warm-up finishes. */
export function startMediaQueue(): void {
  mediaQueue.start();
}

export function addJob<T>(id: string, fn: () => Promise<T | null>): Promise<T | null> {
  if (mediaQueue.size >= MAX_QUEUE_SIZE) {
    logger.warn({ id, size: mediaQueue.size }, "Media worker queue full, dropping job");
    return Promise.resolve(null);
  }
  return mediaQueue.add(
    async () => {
      try {
        logger.info({ id }, "Media job starting");
        const result = await fn();
        logger.info({ id }, "Media job completed");
        return result ?? null;
      } catch (err) {
        logger.error({ err, id }, "Media job failed");
        return null;
      }
    },
    { timeout: 300000 }
  ) as Promise<T | null>;
}

export function getQueueStats() {
  return {
    pending: mediaQueue.size,
    active: mediaQueue.pending,
  };
}
