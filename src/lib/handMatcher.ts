import type { Finger, FingerState, HandTemplate, NormalizedPoint, Pose } from "../types";
import type { HandPoint } from "./hands";
import { normalise } from "./poseMatcher";

export const FINGERS: Finger[] = ["thumb", "index", "middle", "ring", "pinky"];
export const FINGER_UP = 0.35;
export const FINGER_DOWN = 0.6;
export const THUMB_UP = 0.45;
export const THUMB_DOWN = 0.65;
export const HAND_MIN = 50;

const FINGER_BEND = 3.6;
const THUMB_BEND = 1.6;
const FINGERS_WEIGHT = 0.6;
const POSITION_WEIGHT = 0.25;
const DIRECTION_WEIGHT = 0.15;
const POSITION_RANGE = 1.0;
const GAP_RANGE = 0.75;
const LOOK_ALIKE = 85;

type Hands = NonNullable<Pose["hands"]>;
type Vec = { x: number; y: number };

// Landmark chains: each joint bends between its neighbours in the chain
const CHAINS: Record<Finger, number[]> = {
  thumb: [1, 2, 3, 4],
  index: [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};

/** Angle at b, or null when a point coincides with b (the joint is unknown). */
function jointAngle(a: HandPoint, b: HandPoint, c: HandPoint): number | null {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const uz = a.z - b.z;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = c.z - b.z;
  const dot = ux * vx + uy * vy + uz * vz;
  const norm = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
  if (norm < 1e-9) return null;
  return Math.acos(Math.max(-1, Math.min(1, dot / norm)));
}

export function fingerCurls(points: HandPoint[]): Record<Finger, number> {
  const curls = {} as Record<Finger, number>;
  for (const finger of FINGERS) {
    const chain = CHAINS[finger];
    let bend = 0;
    let unknown = false;
    for (let i = 1; i < chain.length - 1; i++) {
      const angle = jointAngle(points[chain[i - 1]], points[chain[i]], points[chain[i + 1]]);
      if (angle === null) unknown = true;
      else bend += Math.PI - angle;
    }
    // A degenerate joint says nothing: stay ambiguous rather than read straight
    curls[finger] = unknown ? 0.5 : Math.min(1, bend / (finger === "thumb" ? THUMB_BEND : FINGER_BEND));
  }
  return curls;
}

export function fingerState(finger: Finger, curl: number): FingerState {
  const [up, down] = finger === "thumb" ? [THUMB_UP, THUMB_DOWN] : [FINGER_UP, FINGER_DOWN];
  if (curl < up) return "up";
  if (curl > down) return "down";
  return "any";
}

/** Shoulder-normalised mean of the wrist and the four knuckles (0, 5, 9, 13, 17). */
export function handCentre(points: HandPoint[], body: NormalizedPoint[], aspect: number): Vec | null {
  const frame = normalise(body, aspect);
  if (!frame) return null;
  const left = body[11];
  const right = body[12];
  const shoulderWidth = Math.abs((right.x - left.x) * aspect);
  const centreX = ((left.x + right.x) / 2) * aspect;
  const centreY = (left.y + right.y) / 2;
  const base = [0, 5, 9, 13, 17].map((i) => points[i]);
  const x = (base.reduce((s, p) => s + p.x, 0) / base.length) * aspect;
  const y = base.reduce((s, p) => s + p.y, 0) / base.length;
  return { x: (x - centreX) / shoulderWidth, y: (y - centreY) / shoulderWidth };
}

export function handDirection(points: HandPoint[], aspect: number): { palm: number; thumb: number } {
  const dir = (from: number, to: number) =>
    Math.atan2(points[to].y - points[from].y, (points[to].x - points[from].x) * aspect);
  return { palm: dir(0, 9), thumb: dir(2, 4) };
}

function angleDiff(a: number, b: number): number {
  const d = a - b;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

function circularMean(angles: number[]): number {
  return Math.atan2(
    angles.reduce((s, a) => s + Math.sin(a), 0),
    angles.reduce((s, a) => s + Math.cos(a), 0)
  );
}

/** Averages hand readings (with their paired body frames) into a template; null when nothing is usable. */
export function makeHandTemplate(
  readings: HandPoint[][],
  bodies: NormalizedPoint[][],
  aspect: number
): HandTemplate | null {
  const rows = readings.flatMap((points, i) => {
    const centre = bodies[i] ? handCentre(points, bodies[i], aspect) : null;
    return centre ? [{ curls: fingerCurls(points), centre, direction: handDirection(points, aspect) }] : [];
  });
  if (rows.length === 0) return null;
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  const curls = {} as Record<Finger, number>;
  const fingers = {} as Record<Finger, FingerState>;
  for (const finger of FINGERS) {
    curls[finger] = mean(rows.map((r) => r.curls[finger]));
    fingers[finger] = fingerState(finger, curls[finger]);
  }
  return {
    fingers,
    curls,
    position: { x: mean(rows.map((r) => r.centre.x)), y: mean(rows.map((r) => r.centre.y)) },
    direction: {
      palm: circularMean(rows.map((r) => r.direction.palm)),
      thumb: circularMean(rows.map((r) => r.direction.thumb)),
    },
  };
}

/** 1 when the curl is fully on the wanted side of its cutoffs, 0 when fully on the wrong side, linear between. */
function ramp(finger: Finger, state: FingerState, curl: number): number {
  if (state === "any") return 1;
  const [up, down] = finger === "thumb" ? [THUMB_UP, THUMB_DOWN] : [FINGER_UP, FINGER_DOWN];
  const wanted = state === "up" ? (down - curl) / (down - up) : (curl - up) / (down - up);
  return Math.max(0, Math.min(1, wanted));
}

function combine(
  curls: Record<Finger, number>,
  position: Vec,
  direction: { palm: number; thumb: number },
  t: HandTemplate,
  opts: { position: boolean; direction: boolean; gapScore?: number }
): number {
  // A product, not a mean: with a mean, one wrong finger out of five would still score ~88 and pass the threshold.
  const fingers = FINGERS.reduce((product, finger) => product * ramp(finger, t.fingers[finger], curls[finger]), 1);
  let total = FINGERS_WEIGHT * fingers;
  let weight = FINGERS_WEIGHT;
  if (opts.position) {
    const near = Math.max(0, 1 - Math.hypot(position.x - t.position.x, position.y - t.position.y) / POSITION_RANGE);
    total += POSITION_WEIGHT * (opts.gapScore === undefined ? near : (near + opts.gapScore) / 2);
    weight += POSITION_WEIGHT;
  }
  if (opts.direction) {
    // The thumb's direction only means something when the recording cares about the thumb
    const diffs = [angleDiff(direction.palm, t.direction.palm)];
    if (t.fingers.thumb !== "any") diffs.push(angleDiff(direction.thumb, t.direction.thumb));
    // Gate on the worst angle, not the mean: a real thumbs down is diagonal, so the thumb turns ~110 degrees
    // while the palm barely moves, and the mean stayed under 90 (thumbs up is not thumbs down).
    if (Math.max(...diffs) > Math.PI / 2) return 0;
    const aligned = diffs.reduce((sum, d) => sum + (1 - d / Math.PI), 0) / diffs.length;
    total += DIRECTION_WEIGHT * aligned;
    weight += DIRECTION_WEIGHT;
  }
  return (total / weight) * 100;
}

/** 0–100. `body` is the raw (un-normalised) body landmarks of the same frame. */
export function scoreHand(
  live: HandPoint[],
  body: NormalizedPoint[],
  aspect: number,
  t: HandTemplate,
  opts: { position: boolean; direction: boolean; gapScore?: number }
): number {
  const centre = handCentre(live, body, aspect);
  if (!centre) return 0;
  return combine(fingerCurls(live), centre, handDirection(live, aspect), t, opts);
}

/** 0–1: how close the live hand-to-hand gap is to the recorded one (shoulder units). */
export function gapScore(liveGap: Vec, recorded: Vec): number {
  return Math.max(0, 1 - Math.hypot(liveGap.x - recorded.x, liveGap.y - recorded.y) / GAP_RANGE);
}

function mirrorTemplate(t: HandTemplate): HandTemplate {
  return {
    ...t,
    position: { x: -t.position.x, y: t.position.y },
    direction: { palm: Math.PI - t.direction.palm, thumb: Math.PI - t.direction.thumb },
  };
}

/**
 * Mirrors the hands as a mirrored body would show them: left and right swap, x flips.
 * The gap (right − left) keeps its x, since the swap and the flip cancel out, and negates y, since the hands trade places.
 */
export function mirrorHands(hands: Hands): Hands {
  return {
    left: hands.right && mirrorTemplate(hands.right),
    right: hands.left && mirrorTemplate(hands.left),
    gap: hands.gap && { x: hands.gap.x, y: -hands.gap.y },
  };
}

/** True when two poses use the same hands, agree on every finger they both specify, and score > 85 against each other. */
export function handsLookAlike(a: Pose, b: Pose): boolean {
  const ticked = (pose: Pose) => (["leftHand", "rightHand"] as const).filter((part) => pose.bodyParts.includes(part));
  const sidesA = ticked(a);
  const sidesB = ticked(b);
  if (sidesA.length === 0 || sidesA.join() !== sidesB.join()) return false;
  const position = a.handPosition !== false && b.handPosition !== false;
  const direction = a.handDirection !== false && b.handDirection !== false;
  return sidesA.every((part) => {
    const side = part === "leftHand" ? "left" : "right";
    const ta = a.hands?.[side];
    const tb = b.hands?.[side];
    if (!ta || !tb) return false;
    const agree = FINGERS.every(
      (f) => ta.fingers[f] === "any" || tb.fingers[f] === "any" || ta.fingers[f] === tb.fingers[f]
    );
    if (!agree) return false;
    const gap =
      position && sidesA.length === 2 && a.hands?.gap && b.hands?.gap ? gapScore(a.hands.gap, b.hands.gap) : undefined;
    return combine(tb.curls, tb.position, tb.direction, ta, { position, direction, gapScore: gap }) > LOOK_ALIKE;
  });
}
