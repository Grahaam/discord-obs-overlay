import type { Finger } from "../types";
import type { HandPoint } from "./hands";

const FINGERS: Finger[] = ["thumb", "index", "middle", "ring", "pinky"];
// Per-finger base direction (radians from straight up, + = toward the thumb side) and [palm, ...phalanx] lengths
const BASE: Record<Finger, { fan: number; lengths: number[] }> = {
  thumb: { fan: -0.9, lengths: [0.1, 0.1, 0.08, 0.07] },
  index: { fan: -0.2, lengths: [0.28, 0.1, 0.07, 0.06] },
  middle: { fan: 0, lengths: [0.3, 0.11, 0.08, 0.06] },
  ring: { fan: 0.2, lengths: [0.28, 0.1, 0.07, 0.06] },
  pinky: { fan: 0.4, lengths: [0.25, 0.08, 0.05, 0.05] },
};
const BEND = 1.5; // radians added per joint at curl 1

/** 21 synthetic hand points (frame fractions, y down) for a given curl per finger (0 straight, 1 fully curled). */
export function handSkeleton(
  curls: Record<Finger, number>,
  opts: { cx?: number; cy?: number; scale?: number; angle?: number; thumbAngle?: number } = {}
): HandPoint[] {
  const { cx = 0.5, cy = 0.5, scale = 1, angle = 0, thumbAngle = 0 } = opts;
  const wrist = { x: 0, y: 0.2 };
  const out: HandPoint[] = [{ x: wrist.x, y: wrist.y, z: 0 }];
  for (const finger of FINGERS) {
    const { fan, lengths } = BASE[finger];
    const curl = curls[finger];
    // Heading measured from "up"; positive turns toward the palm side (x increases for the fan, bend folds back toward -y... kept in a plane)
    let heading = fan + (finger === "thumb" ? thumbAngle : 0);
    const side = finger === "thumb" ? -1 : 1;
    let px = wrist.x;
    let py = wrist.y;
    lengths.forEach((len, joint) => {
      // joint 0 is the palm segment (wrist -> CMC/MCP): never bends
      if (joint > 0) heading += side * BEND * curl;
      px += Math.sin(heading) * len;
      py -= Math.cos(heading) * len;
      out.push({ x: px, y: py, z: joint > 0 ? curl * 0.02 * joint : 0 });
    });
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return out.map((p) => ({
    x: cx + (p.x * cos - (p.y - 0.2) * sin) * scale,
    y: cy + (p.x * sin + (p.y - 0.2) * cos) * scale,
    z: p.z,
  }));
}

const curls = (thumb: number, index: number, middle: number, ring: number, pinky: number) => ({
  thumb,
  index,
  middle,
  ring,
  pinky,
});

export const openPalm = handSkeleton(curls(0, 0, 0, 0, 0));
export const fist = handSkeleton(curls(1, 1, 1, 1, 1));
export const victory = handSkeleton(curls(1, 0, 0, 1, 1));
export const threeFingers = handSkeleton(curls(1, 0, 0, 0, 1));
export const thumbsUp = handSkeleton(curls(0, 1, 1, 1, 1), { thumbAngle: 0.9 });
export const thumbsDown = handSkeleton(curls(0, 1, 1, 1, 1), { thumbAngle: 0.9, angle: Math.PI });
