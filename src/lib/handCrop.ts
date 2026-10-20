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
/** Square crop in frame pixels; `angle` (radians) rotates the frame so the forearm points up. */
export interface CropBox {
  cx: number;
  cy: number;
  size: number;
  angle: number;
}
type Frame = { width: number; height: number };

const MIN_SIZE = 96;
const FOLLOW_MS = 500;
const FOLLOW_MARGIN = 1.3;
const MERGE_OVERLAP = 0.4;
const MERGE_MARGIN = 1.15;
const FOREARM_SHIFT = 0.15;

const BODY = {
  left: { elbow: 13, wrist: 15, tips: [21, 19, 17] },
  right: { elbow: 14, wrist: 16, tips: [22, 20, 18] },
} as const;

// Rotation that turns a frame vector (dx, dy) to point straight up (-y)
const upAngle = (dx: number, dy: number) => -Math.PI / 2 - Math.atan2(dy, dx);

export function handCrop(
  body: NormalizedPoint[],
  side: HandSide,
  frame: Frame,
  previous?: HandReading,
  now?: number
): CropBox | null {
  const ids = BODY[side];
  const wrist = body[ids.wrist];
  const elbow = body[ids.elbow];
  if (!wrist || !elbow || wrist.visibility < MIN_VISIBILITY) return null;

  if (previous && now !== undefined && now - previous.time <= FOLLOW_MS && previous.points.length === 21) {
    const xs = previous.points.map((p) => p.x * frame.width);
    const ys = previous.points.map((p) => p.y * frame.height);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const [wrist0, knuckle] = [previous.points[0], previous.points[9]];
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      size: Math.max(maxX - minX, maxY - minY) * FOLLOW_MARGIN,
      angle: upAngle((knuckle.x - wrist0.x) * frame.width, (knuckle.y - wrist0.y) * frame.height),
    };
  }

  const px = (p: NormalizedPoint) => ({ x: p.x * frame.width, y: p.y * frame.height });
  const w = px(wrist);
  const e = px(elbow);
  const tips = ids.tips.map((i) => px(body[i]));
  const forearm = { x: w.x - e.x, y: w.y - e.y };
  const forearmLen = Math.hypot(forearm.x, forearm.y);
  const reach = Math.max(...tips.map((t) => Math.hypot(t.x - w.x, t.y - w.y)));
  const pts = [w, ...tips];
  return {
    cx: pts.reduce((s, p) => s + p.x, 0) / pts.length + forearm.x * FOREARM_SHIFT,
    cy: pts.reduce((s, p) => s + p.y, 0) / pts.length + forearm.y * FOREARM_SHIFT,
    size: Math.max(2.5 * reach, 1.3 * forearmLen, MIN_SIZE),
    angle: upAngle(forearm.x, forearm.y),
  };
}

/** One box covering both when they overlap by more than 40 % of the smaller one (axis-aligned), else null. */
export function mergeCrops(a: CropBox, b: CropBox): CropBox | null {
  const overlapX = Math.min(a.cx + a.size / 2, b.cx + b.size / 2) - Math.max(a.cx - a.size / 2, b.cx - b.size / 2);
  const overlapY = Math.min(a.cy + a.size / 2, b.cy + b.size / 2) - Math.max(a.cy - a.size / 2, b.cy - b.size / 2);
  if (overlapX <= 0 || overlapY <= 0) return null;
  const smaller = Math.min(a.size, b.size) ** 2;
  if ((overlapX * overlapY) / smaller <= MERGE_OVERLAP) return null;
  const minX = Math.min(a.cx - a.size / 2, b.cx - b.size / 2);
  const maxX = Math.max(a.cx + a.size / 2, b.cx + b.size / 2);
  const minY = Math.min(a.cy - a.size / 2, b.cy - b.size / 2);
  const maxY = Math.max(a.cy + a.size / 2, b.cy + b.size / 2);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    size: Math.max(maxX - minX, maxY - minY) * MERGE_MARGIN,
    angle: 0,
  };
}

/** Crop fractions (0-1 of the 224 px crop) -> frame fractions. z is kept. */
export function cropToFrame(p: HandPoint, box: CropBox, frame: Frame): HandPoint {
  const ox = (p.x - 0.5) * box.size;
  const oy = (p.y - 0.5) * box.size;
  const cos = Math.cos(-box.angle);
  const sin = Math.sin(-box.angle);
  return {
    x: (box.cx + ox * cos - oy * sin) / frame.width,
    y: (box.cy + ox * sin + oy * cos) / frame.height,
    z: p.z,
  };
}

/** Frame fractions -> crop fractions. Inverse of cropToFrame. */
export function frameToCrop(p: HandPoint, box: CropBox, frame: Frame): HandPoint {
  const ox = p.x * frame.width - box.cx;
  const oy = p.y * frame.height - box.cy;
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  return {
    x: (ox * cos - oy * sin) / box.size + 0.5,
    y: (ox * sin + oy * cos) / box.size + 0.5,
    z: p.z,
  };
}

export const CROP_PX = 224;

/** Draws the box, rotated upright, onto a black CROP_PX square. Outside the frame stays black. */
export function drawCrop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  box: CropBox
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CROP_PX, CROP_PX);
  ctx.translate(CROP_PX / 2, CROP_PX / 2);
  ctx.rotate(box.angle);
  ctx.scale(CROP_PX / box.size, CROP_PX / box.size);
  ctx.translate(-box.cx, -box.cy);
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
