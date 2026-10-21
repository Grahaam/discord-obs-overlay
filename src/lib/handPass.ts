import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { NormalizedPoint } from "../types";
import {
  assignToWrists,
  cropToFrame,
  drawCrop,
  handCrop,
  planHandCrops,
  type CropBox,
  type HandPoint,
  type HandReading,
  type HandSide,
} from "./handCrop";

export interface HandLandmarkers {
  /** numHands 1: one crop per hand */
  single: HandLandmarker;
  /** numHands 2: the merged crop when both hands are close */
  double: HandLandmarker;
}
export type LiveHands = { left?: HandReading; right?: HandReading };
export type LiveCrops = { left?: CropBox; right?: CropBox };

type Found = { points: HandPoint[]; score: number };

function readHands(result: HandLandmarkerResult, box: CropBox, frame: { width: number; height: number }): Found[] {
  return result.landmarks.map((pts, i) => ({
    points: pts.map((p) => cropToFrame({ x: p.x, y: p.y, z: p.z }, box, frame)),
    score: result.handedness[i]?.[0]?.score ?? 0,
  }));
}

/**
 * Finds the requested hands in one frame: a crop per hand around the body wrist (or the previous
 * reading), the hand model on each crop (or once on the merged crop), points mapped back to frame fractions.
 */
export function runHandPass({
  landmarkers,
  ctx,
  source,
  body,
  sides,
  previous,
  now,
}: {
  landmarkers: HandLandmarkers;
  /** CROP_PX square scratch canvas */
  ctx: OffscreenCanvasRenderingContext2D;
  /** The full-size screenshot */
  source: ImageBitmap;
  body: NormalizedPoint[];
  sides: { left: boolean; right: boolean };
  previous: LiveHands;
  now: number;
}): { hands: LiveHands; crops: LiveCrops } {
  const frame = { width: source.width, height: source.height };
  const crop = (side: HandSide) => (sides[side] ? handCrop(body, side, frame, previous[side], now) : null);
  const left = crop("left");
  const right = crop("right");
  const plan = planHandCrops(left, right);
  const detect = (lm: HandLandmarker, box: CropBox) => {
    drawCrop(ctx, source, box);
    return readHands(lm.detect(ctx.canvas), box, frame);
  };

  const hands: LiveHands = {};
  if (plan.merged) {
    const found = detect(landmarkers.double, plan.merged);
    const assigned = assignToWrists(
      found.map((f) => f.points),
      body
    );
    for (const side of ["left", "right"] as const) {
      const f = found.find((h) => h.points === assigned[side]);
      if (f) hands[side] = { ...f, time: now };
    }
  } else {
    for (const side of ["left", "right"] as const) {
      const box = plan[side];
      const f = box && detect(landmarkers.single, box)[0];
      if (f) hands[side] = { ...f, time: now };
    }
  }
  return { hands, crops: { ...(left && { left }), ...(right && { right }) } };
}
