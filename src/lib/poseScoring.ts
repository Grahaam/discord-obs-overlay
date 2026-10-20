import type { NormalizedPoint, Pose, PosesFile } from "../types";
import { isAbsoluteCinemaPose } from "./absoluteCinemaPose";
import { normalise, scorePose } from "./poseMatcher";
import { hasMedia, visiblePoses } from "./poseMedia";

export interface PoseScore {
  poseId: string;
  /** 0–100, or null when the pose can't be compared (joints not visible, no template) */
  score: number | null;
  threshold: number;
  holdMs: number;
}

/** Poses the overlay should try to detect: visible, enabled, with media, and recorded if custom. */
export function detectablePoses(file: PosesFile): Pose[] {
  return visiblePoses(file).filter(
    (pose) => pose.enabled && hasMedia(pose) && (pose.kind === "builtin" || !!pose.template)
  );
}

/**
 * Scores one frame against each pose. The built-in pose is rule-based, so it scores
 * 100 or nothing; custom poses use the template matcher.
 */
export function scoreFrame(poses: Pose[], landmarks: NormalizedPoint[] | null, aspect: number): PoseScore[] {
  const live = landmarks ? normalise(landmarks, aspect) : null;
  return poses.map((pose) => {
    let score: number | null = null;
    if (landmarks && pose.builtinId === "absolute-cinema") {
      score = isAbsoluteCinemaPose(landmarks) ? 100 : null;
    } else if (live && pose.template) {
      score = scorePose(live, pose.template, { bodyParts: pose.bodyParts, mirror: pose.mirror });
    }
    return { poseId: pose.id, score, threshold: pose.threshold, holdMs: pose.holdMs };
  });
}
