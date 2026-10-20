import type { BodyPart, NormalizedPoint } from "../types";

export type BodyOnlyPart = "arms" | "legs" | "head";

export const JOINTS: Record<BodyOnlyPart, number[]> = {
  arms: [11, 12, 13, 14, 15, 16],
  head: [0, 7, 8],
  legs: [23, 24, 25, 26, 27, 28],
};

export const ANGLE_WEIGHT = 0.6;
export const POSITION_WEIGHT = 0.4;
export const MIN_VISIBILITY = 0.5;
export const HYSTERESIS = 5;
export const SIMILAR_WARN = 85;
export const MIN_GOOD_FRAMES = 10;

const MIRROR_PAIRS: Array<[number, number]> = [
  [11, 12],
  [13, 14],
  [15, 16],
  [23, 24],
  [25, 26],
  [27, 28],
  [7, 8],
];

function maskedIndices(bodyParts: BodyPart[]): number[] {
  return [...new Set(bodyParts.flatMap((part) => (part in JOINTS ? JOINTS[part as BodyOnlyPart] : [])))];
}

function visible(points: NormalizedPoint[], indices: number[]): boolean {
  return indices.every((index) => (points[index]?.visibility ?? 0) >= MIN_VISIBILITY);
}

function angle(a: NormalizedPoint, b: NormalizedPoint, c: NormalizedPoint): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  return Math.atan2(Math.abs(abx * cby - aby * cbx), abx * cbx + aby * cby);
}

/** Smallest difference between two angles (0–π): 179° and -179° are 2° apart, not 358°. */
function angleDiff(a: number, b: number): number {
  const d = a - b;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

function angleFeatures(points: NormalizedPoint[], bodyParts: BodyPart[]): number[] {
  const features: number[] = [];
  if (bodyParts.includes("arms")) {
    features.push(angle(points[11], points[13], points[15]), angle(points[12], points[14], points[16]));
    features.push(
      Math.atan2(points[15].y - points[11].y, points[15].x - points[11].x),
      Math.atan2(points[16].y - points[12].y, points[16].x - points[12].x)
    );
  }
  if (bodyParts.includes("legs")) {
    features.push(angle(points[23], points[25], points[27]), angle(points[24], points[26], points[28]));
  }
  if (bodyParts.includes("head")) {
    features.push(Math.atan2(points[8].y - points[7].y, points[8].x - points[7].x));
  }
  return features;
}

function mirrored(points: NormalizedPoint[]): NormalizedPoint[] {
  const result = points.map((point) => ({ ...point, x: -point.x }));
  for (const [left, right] of MIRROR_PAIRS) {
    [result[left], result[right]] = [result[right], result[left]];
  }
  return result;
}

function scoreOne(live: NormalizedPoint[], template: NormalizedPoint[], bodyParts: BodyPart[]): number | null {
  const indices = maskedIndices(bodyParts);
  if (!visible(live, indices) || !visible(template, indices)) return null;

  const liveAngles = angleFeatures(live, bodyParts);
  const templateAngles = angleFeatures(template, bodyParts);
  const angleScore =
    liveAngles.length === 0
      ? 1
      : liveAngles.reduce((sum, value, index) => sum + (1 - angleDiff(value, templateAngles[index]) / Math.PI), 0) /
        liveAngles.length;
  const positionScore =
    indices.reduce((sum, index) => {
      const dx = live[index].x - template[index].x;
      const dy = live[index].y - template[index].y;
      return sum + Math.max(0, 1 - Math.hypot(dx, dy));
    }, 0) / indices.length;
  return (ANGLE_WEIGHT * angleScore + POSITION_WEIGHT * positionScore) * 100;
}

export function normalise(landmarks: NormalizedPoint[], aspect: number): NormalizedPoint[] | null {
  const left = landmarks[11];
  const right = landmarks[12];
  if (!left || !right || left.visibility < MIN_VISIBILITY || right.visibility < MIN_VISIBILITY) return null;
  const shoulderWidth = Math.abs((right.x - left.x) * aspect);
  if (shoulderWidth < 0.0001) return null;
  const centreX = ((left.x + right.x) / 2) * aspect;
  const centreY = (left.y + right.y) / 2;
  return landmarks.map((point) => ({
    x: (point.x * aspect - centreX) / shoulderWidth,
    y: (point.y - centreY) / shoulderWidth,
    visibility: point.visibility,
  }));
}

/** Direct and mirrored body scores kept apart, so hands can be combined with each variant. */
export function scorePoseBoth(
  live: NormalizedPoint[],
  template: NormalizedPoint[],
  bodyParts: BodyPart[]
): { direct: number | null; flipped: number | null } {
  return {
    direct: scoreOne(live, template, bodyParts),
    flipped: scoreOne(mirrored(live), template, bodyParts),
  };
}

export function scorePose(
  live: NormalizedPoint[],
  template: NormalizedPoint[],
  opts: { bodyParts: BodyPart[]; mirror: boolean }
): number | null {
  const direct = scoreOne(live, template, opts.bodyParts);
  if (!opts.mirror) return direct;
  const flipped = scoreOne(mirrored(live), template, opts.bodyParts);
  if (direct === null) return flipped;
  if (flipped === null) return direct;
  return Math.max(direct, flipped);
}

export function similarity(a: NormalizedPoint[], b: NormalizedPoint[], bodyParts: BodyPart[]): number {
  return scorePose(a, b, { bodyParts, mirror: false }) ?? 0;
}

/** True when a raw frame shows every joint of these body parts clearly enough to become part of a template. */
export function isUsableFrame(landmarks: NormalizedPoint[], aspect: number, bodyParts: BodyPart[]): boolean {
  const frame = normalise(landmarks, aspect);
  return frame !== null && visible(frame, maskedIndices(bodyParts));
}

export function averageTemplate(
  frames: NormalizedPoint[][],
  aspect: number,
  bodyParts: BodyPart[]
): NormalizedPoint[] | null {
  const good = frames
    .filter((frame) => isUsableFrame(frame, aspect, bodyParts))
    .map((frame) => normalise(frame, aspect)!);
  if (good.length < MIN_GOOD_FRAMES) return null;
  return good[0].map((_, index) => ({
    x: good.reduce((sum, frame) => sum + frame[index].x, 0) / good.length,
    y: good.reduce((sum, frame) => sum + frame[index].y, 0) / good.length,
    visibility: good.reduce((sum, frame) => sum + frame[index].visibility, 0) / good.length,
  }));
}

export function createHoldTracker() {
  let candidate: { poseId: string; since: number; fired: boolean } | null = null;

  return {
    update(
      scores: Array<{ poseId: string; score: number | null; threshold: number; holdMs: number }>,
      now: number
    ): string | null {
      const eligible = scores.filter((entry) => entry.score !== null && entry.score >= entry.threshold);
      if (candidate) {
        const current = scores.find((entry) => entry.poseId === candidate?.poseId);
        if (!current || current.score === null || current.score < current.threshold - HYSTERESIS) {
          candidate = null;
        } else if (eligible.some((entry) => entry.poseId !== candidate?.poseId && entry.score! > current.score!)) {
          candidate = null;
        }
      }
      if (!candidate) {
        const best = eligible.sort((a, b) => b.score! - a.score!)[0];
        if (!best) return null;
        candidate = { poseId: best.poseId, since: now, fired: false };
      }
      if (!candidate.fired) {
        const current = scores.find((entry) => entry.poseId === candidate?.poseId);
        if (current && now - candidate.since >= current.holdMs) {
          candidate.fired = true;
          return candidate.poseId;
        }
      }
      return null;
    },
    reset() {
      candidate = null;
    },
  };
}
