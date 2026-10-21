import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { HandTemplate, NormalizedPoint } from "../types";
import type { HandPoint } from "./hands.js";
import { scoreHand } from "./handMatcher.js";

// Real webcam data recorded with the user (dashboard recorder + logged live frames).
// Frames keep the 21 hand points and the two shoulders, which is all hand scoring reads.
interface RealFixture {
  aspect: number;
  templates: Record<string, { right?: HandTemplate }>;
  frames: { label: string; right: number[][]; shoulders: number[][] }[];
}
const real = JSON.parse(
  fs.readFileSync(new URL("./fixtures/hands/real-2026-10-21.json", import.meta.url), "utf8")
) as RealFixture;

const toHand = (pts: number[][]): HandPoint[] => pts.map(([x, y, z]) => ({ x, y, z }));
function toBody(shoulders: number[][]): NormalizedPoint[] {
  const body = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  [body[11], body[12]] = shoulders.map(([x, y, visibility]) => ({ x, y, visibility }));
  return body;
}
const ON = { position: true, direction: true };
const rightTemplates = Object.entries(real.templates).filter(([, t]) => !!t.right);
const score = (frame: RealFixture["frames"][number], label: string) =>
  scoreHand(toHand(frame.right), toBody(frame.shoulders), real.aspect, real.templates[label].right!, ON);

test("real frames match their own recorded hand shape", () => {
  for (const frame of real.frames) {
    assert.ok(score(frame, frame.label) >= 80, `${frame.label} scored ${score(frame, frame.label).toFixed(0)}`);
  }
});

test("real frames score best against their own shape", () => {
  // Only the one-hand recordings compete: heart and pray are two-hand poses
  const candidates = rightTemplates.map(([label]) => label).filter((l) => l !== "heart" && l !== "pray");
  for (const frame of real.frames) {
    const best = candidates.reduce((a, b) => (score(frame, b) > score(frame, a) ? b : a));
    assert.equal(best, frame.label);
  }
});

test("real thumbs up and thumbs down never match each other", () => {
  // Same fingers; only the thumb direction differs (diagonal on a real webcam, not straight up/down)
  for (const frame of real.frames.filter((f) => f.label === "thumbUp")) {
    assert.ok(score(frame, "thumbDown") < 50, `thumbUp vs thumbDown: ${score(frame, "thumbDown").toFixed(0)}`);
  }
  for (const frame of real.frames.filter((f) => f.label === "thumbDown")) {
    assert.ok(score(frame, "thumbUp") < 50, `thumbDown vs thumbUp: ${score(frame, "thumbUp").toFixed(0)}`);
  }
});
