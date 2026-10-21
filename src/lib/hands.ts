import type { NormalizedPoint } from "../types";
import { MIN_VISIBILITY } from "./poseMatcher";

export type HandSide = "left" | "right";
/** x/y are frame fractions (0-1); z is relative depth as given by the model. */
export interface HandPoint {
  x: number;
  y: number;
  z: number;
}
export interface HandReading {
  points: HandPoint[];
  score: number;
  time: number;
}

/**
 * Assigns hands to the visible body wrists (15 left / 16 right) by their point 0: as many sides as possible,
 * then the lowest total distance. Empty hands and hidden or missing wrists are skipped.
 */
export function assignToWrists(
  hands: HandPoint[][],
  body: NormalizedPoint[]
): { left?: HandPoint[]; right?: HandPoint[] } {
  const valid = hands.filter((h) => h.length > 0);
  const wrist = (i: number) => (body[i] && body[i].visibility >= MIN_VISIBILITY ? body[i] : undefined);
  const wl = wrist(15);
  const wr = wrist(16);
  const dist = (h: HandPoint[], w: NormalizedPoint) => Math.hypot(h[0].x - w.x, h[0].y - w.y);
  const lefts: (HandPoint[] | undefined)[] = wl ? [undefined, ...valid] : [undefined];
  const rights: (HandPoint[] | undefined)[] = wr ? [undefined, ...valid] : [undefined];
  let best: { left?: HandPoint[]; right?: HandPoint[] } = {};
  let bestCount = 0;
  let bestCost = Infinity;
  for (const l of lefts) {
    for (const r of rights) {
      if (l && l === r) continue;
      const count = (l ? 1 : 0) + (r ? 1 : 0);
      const cost = (l && wl ? dist(l, wl) : 0) + (r && wr ? dist(r, wr) : 0);
      if (count > bestCount || (count === bestCount && cost < bestCost)) {
        best = { left: l, right: r };
        bestCount = count;
        bestCost = cost;
      }
    }
  }
  return { ...(best.left && { left: best.left }), ...(best.right && { right: best.right }) };
}
