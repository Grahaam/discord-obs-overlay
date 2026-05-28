import PQueue from "p-queue";

const MAX_QUEUE_SIZE = 50;

const mediaQueue = new PQueue({ concurrency: 2 });

// Per-type file size limits in bytes
export const SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB
  gif: 25 * 1024 * 1024, // 25MB
  video: 50 * 1024 * 1024, // 50MB
  audio: 15 * 1024 * 1024, // 15MB
};

export function addJob<T>(id: string, fn: () => Promise<T | null>): Promise<T | null> {
  if (mediaQueue.size >= MAX_QUEUE_SIZE) {
    console.warn(`[MediaWorker] Queue full (${MAX_QUEUE_SIZE}), dropping job: ${id}`);
    return Promise.resolve(null);
  }
  return mediaQueue.add(
    async () => {
      try {
        console.log(`[MediaWorker] Starting: ${id}`);
        const result = await fn();
        console.log(`[MediaWorker] Done: ${id}`);
        return result ?? null;
      } catch (err) {
        console.error(`[MediaWorker] Job ${id} failed:`, err);
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
