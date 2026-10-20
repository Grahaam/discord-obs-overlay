import type { Pose } from "../types";

export function hasMedia(pose: Pose): boolean {
  return pose.media.type === "image" ? !!pose.media.imageUrl?.trim() : !!pose.media.videoUrl?.trim();
}
