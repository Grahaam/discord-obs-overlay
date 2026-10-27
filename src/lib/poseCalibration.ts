import type { BodyPart, Finger, HandTemplate, NormalizedPoint, Pose } from "../types";
import { FINGERS } from "./handMatcher";
import { JOINTS, mirrored, scorePose, type BodyOnlyPart } from "./poseMatcher";

export const MAX_EXTRA_TEMPLATES = 5;
export const MIN_NEGATIVE_SAMPLES = 10;
export const THRESHOLD_MARGIN = 5;
export const THRESHOLD_MIN = 50;
export const THRESHOLD_MAX = 98;

/** MediaPipe joint index → label key stem (side is split off so locales stay short) */
export const JOINT_PARTS: Record<number, { part: string; side?: "left" | "right" }> = {
  0: { part: "Head" },
  7: { part: "Ear", side: "left" },
  8: { part: "Ear", side: "right" },
  11: { part: "Shoulder", side: "left" },
  12: { part: "Shoulder", side: "right" },
  13: { part: "Elbow", side: "left" },
  14: { part: "Elbow", side: "right" },
  15: { part: "Wrist", side: "left" },
  16: { part: "Wrist", side: "right" },
  23: { part: "Hip", side: "left" },
  24: { part: "Hip", side: "right" },
  25: { part: "Knee", side: "left" },
  26: { part: "Knee", side: "right" },
  27: { part: "Ankle", side: "left" },
  28: { part: "Ankle", side: "right" },
};

/** The main recorded body example followed by the extra ones. */
export function bodyTemplates(pose: Pick<Pose, "template" | "extraTemplates">): NormalizedPoint[][] {
  return [...(pose.template ? [pose.template] : []), ...(pose.extraTemplates ?? [])];
}

/** Best score of the live frame against any example (nearest neighbour), mirrored too when asked. */
export function bestExampleScore(
  live: NormalizedPoint[],
  templates: NormalizedPoint[][],
  opts: { bodyParts: BodyPart[]; mirror: boolean }
): number | null {
  let best: number | null = null;
  for (const template of templates) {
    const score = scorePose(live, template, opts);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

export interface WeakJoint {
  joint: number;
  /** distance to the closest example, in shoulder widths */
  distance: number;
}

/** The joint that sits farthest from the closest example: what to move to reach the pose. */
export function weakestJoint(
  live: NormalizedPoint[],
  templates: NormalizedPoint[][],
  opts: { bodyParts: BodyPart[]; mirror: boolean }
): WeakJoint | null {
  const indices = [...new Set(opts.bodyParts.flatMap((part) => (part in JOINTS ? JOINTS[part as BodyOnlyPart] : [])))];
  if (indices.length === 0) return null;
  const variants = opts.mirror ? [live, mirrored(live)] : [live];
  let best: { score: number; variant: NormalizedPoint[]; template: NormalizedPoint[] } | null = null;
  for (const template of templates) {
    for (const variant of variants) {
      const score = scorePose(variant, template, { bodyParts: opts.bodyParts, mirror: false });
      if (score !== null && (!best || score > best.score)) best = { score, variant, template };
    }
  }
  if (!best) return null;
  let worst: WeakJoint | null = null;
  for (const joint of indices) {
    const distance = Math.hypot(
      best.variant[joint].x - best.template[joint].x,
      best.variant[joint].y - best.template[joint].y
    );
    if (!worst || distance > worst.distance) worst = { joint, distance };
  }
  return worst;
}

/** The finger whose curl is farthest from the recorded one (fingers set to "any" are ignored). */
export function weakestFinger(
  live: Record<Finger, number>,
  template: HandTemplate
): { finger: Finger; distance: number } | null {
  let worst: { finger: Finger; distance: number } | null = null;
  for (const finger of FINGERS) {
    if (template.fingers[finger] === "any") continue;
    const distance = Math.abs(live[finger] - template.curls[finger]);
    if (!worst || distance > worst.distance) worst = { finger, distance };
  }
  return worst;
}

export interface ThresholdSuggestion {
  /** 95th percentile of the scores while not posing */
  peak: number;
  suggested: number;
  /** true when the current threshold already sits above the suggestion */
  fine: boolean;
}

/** Threshold just above what "streaming normally" reaches; null with too few scored frames. */
export function suggestThreshold(negativeScores: number[], current: number): ThresholdSuggestion | null {
  if (negativeScores.length < MIN_NEGATIVE_SAMPLES) return null;
  const sorted = [...negativeScores].sort((a, b) => a - b);
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const suggested = Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.ceil(peak) + THRESHOLD_MARGIN));
  return { peak, suggested, fine: current >= suggested };
}
