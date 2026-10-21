import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { BodyPart, NormalizedPoint } from "../types";
import { SIMILAR_WARN, normalise, scorePose, similarity } from "./poseMatcher.js";

// Real webcam data recorded with the user: five body poses (dashboard recorder) and live frames,
// including "relaxed" frames from sitting and moving normally with both wrists below the shoulders.
interface RealBody {
  aspect: number;
  templates: Record<string, { bodyParts: BodyPart[]; template: number[][] }>;
  frames: { label: string; body: number[][] }[];
}
const real = JSON.parse(
  fs.readFileSync(new URL("./fixtures/body/real-2026-10-21.json", import.meta.url), "utf8")
) as RealBody;

const toPoints = (pts: number[][]): NormalizedPoint[] => pts.map(([x, y, visibility]) => ({ x, y, visibility }));
const labels = Object.keys(real.templates);
const score = (body: number[][], label: string) => {
  const live = normalise(toPoints(body), real.aspect);
  const t = real.templates[label];
  return live ? scorePose(live, toPoints(t.template), { bodyParts: t.bodyParts, mirror: true }) : null;
};

test("real body frames match their own recorded pose", () => {
  for (const frame of real.frames.filter((f) => f.label !== "relaxed")) {
    const s = score(frame.body, frame.label);
    assert.ok(s !== null && s >= 90, `${frame.label} scored ${s}`);
  }
});

test("real body frames score best against their own pose", () => {
  for (const frame of real.frames.filter((f) => f.label !== "relaxed")) {
    const best = labels.reduce((a, b) => ((score(frame.body, b) ?? 0) > (score(frame.body, a) ?? 0) ? b : a));
    assert.equal(best, frame.label);
  }
});

test("relaxed frames (arms down, sitting and moving normally) match no pose", () => {
  for (const frame of real.frames.filter((f) => f.label === "relaxed")) {
    for (const label of labels) {
      const s = score(frame.body, label);
      assert.ok(s === null || s < 80, `relaxed frame scored ${s} on ${label}`);
    }
  }
});

test("the look-alike warning flags close real poses and leaves distinct ones alone", () => {
  const sim = (a: string, b: string) =>
    similarity(toPoints(real.templates[a].template), toPoints(real.templates[b].template), real.templates[a].bodyParts);
  // Hands on head and a double biceps flex both hold the elbows out and up
  assert.ok(sim("headHands", "flex") > SIMILAR_WARN);
  assert.ok(sim("shrug", "armsX") <= SIMILAR_WARN);
  assert.ok(sim("rightArmUp", "armsX") <= SIMILAR_WARN);
});
