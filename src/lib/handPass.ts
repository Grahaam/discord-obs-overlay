import type { HandLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedPoint } from "../types";
import { assignToWrists, type HandReading } from "./hands";

export type LiveHands = { left?: HandReading; right?: HandReading };

/**
 * Finds the requested hands in one frame: the hand model runs once on the whole screenshot
 * (numHands 2) and each hand goes to the nearest body wrist.
 *
 * No crops of our own: on real webcam frames, crops around the wrist left a fist or a thumbs up
 * unrecognised (0/6), while the whole 640 px frame found 5/6 with the same finger precision —
 * the model already finds the palm in the full image and crops it at full resolution itself.
 */
export function runHandPass({
  landmarker,
  source,
  body,
  sides,
  now,
}: {
  /** numHands 2 */
  landmarker: HandLandmarker;
  /** The full-size screenshot */
  source: ImageBitmap;
  body: NormalizedPoint[];
  sides: { left: boolean; right: boolean };
  now: number;
}): { hands: LiveHands } {
  const result = landmarker.detect(source);
  const found = result.landmarks.map((pts, i) => ({
    points: pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    score: result.handedness[i]?.[0]?.score ?? 0,
  }));
  const assigned = assignToWrists(
    found.map((f) => f.points),
    body
  );
  const hands: LiveHands = {};
  for (const side of ["left", "right"] as const) {
    const f = sides[side] && found.find((h) => h.points === assigned[side]);
    if (f) hands[side] = { ...f, time: now };
  }
  return { hands };
}
