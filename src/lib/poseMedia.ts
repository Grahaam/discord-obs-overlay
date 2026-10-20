import type { Pose, PosesFile } from "../types";

export function hasMedia(pose: Pose): boolean {
  return pose.media.type === "image" ? !!pose.media.imageUrl?.trim() : !!pose.media.videoUrl?.trim();
}

/** Poses shown in the dashboard and usable for detection: built-ins the streamer deleted are hidden. */
export function visiblePoses(file: PosesFile): Pose[] {
  return file.poses.filter((pose) => !pose.builtinId || !file.hiddenBuiltins.includes(pose.builtinId));
}
