import assert from "node:assert/strict";
import test from "node:test";
import type { Pose } from "../types";
import { armsUp, skeleton, tPose } from "./poseFixtures.js";
import { normalise } from "./poseMatcher.js";
import { bestExampleScore, bodyTemplates, suggestThreshold, weakestJoint } from "./poseCalibration.js";
import { scoreFrame } from "./poseScoring.js";

const media = {
  type: "image" as const,
  imageUrl: "/user-assets/a.png",
  volume: 0.8,
  maxDurationSeconds: 30,
  fullscreen: true,
};
const pose = (extra: Partial<Pose> = {}): Pose => ({
  id: "p",
  name: "p",
  kind: "custom",
  enabled: true,
  template: normalise(armsUp, 1)!,
  bodyParts: ["arms"],
  threshold: 80,
  mirror: false,
  holdMs: 600,
  cooldownSeconds: 30,
  media,
  ...extra,
});

test("bodyTemplates lists the main template then the extra ones", () => {
  const extra = normalise(tPose, 1)!;
  assert.equal(bodyTemplates(pose({ extraTemplates: [extra] })).length, 2);
  assert.equal(bodyTemplates(pose({ template: undefined })).length, 0);
});

test("a second example makes a different pose match", () => {
  const live = normalise(tPose, 1)!;
  const opts = { bodyParts: ["arms" as const], mirror: false };
  const alone = bestExampleScore(live, bodyTemplates(pose()), opts)!;
  const withExample = bestExampleScore(live, bodyTemplates(pose({ extraTemplates: [live] })), opts)!;
  assert.ok(alone < 90);
  assert.ok(withExample > 99);
});

test("scoreFrame uses the closest example", () => {
  const withExample = pose({ extraTemplates: [normalise(tPose, 1)!] });
  const [score] = scoreFrame([withExample], tPose, 1);
  assert.ok((score.score ?? 0) > 99);
});

test("weakestJoint names the joint farthest from the pose", () => {
  const off = skeleton({
    11: [0.4, 0.5],
    12: [0.6, 0.5],
    13: [0.32, 0.35],
    14: [0.68, 0.35],
    15: [0.25, 0.15],
    16: [0.75, 0.55], // right wrist dropped
  });
  const weak = weakestJoint(normalise(off, 1)!, bodyTemplates(pose()), { bodyParts: ["arms"], mirror: false });
  assert.equal(weak?.joint, 16);
  assert.ok(weak!.distance > 0.5);
});

test("weakestJoint is null without a template or joints", () => {
  const live = normalise(armsUp, 1)!;
  assert.equal(weakestJoint(live, [], { bodyParts: ["arms"], mirror: false }), null);
  assert.equal(weakestJoint(live, bodyTemplates(pose()), { bodyParts: [], mirror: false }), null);
});

test("suggestThreshold sits above the 95th percentile of the negatives", () => {
  const scores = Array.from({ length: 40 }, (_, i) => 40 + i); // 40–79
  const result = suggestThreshold(scores, 80)!;
  assert.equal(result.peak, 78);
  assert.equal(result.suggested, 83);
  assert.equal(result.fine, false);
});

test("suggestThreshold is fine when the current threshold is higher, and clamped", () => {
  assert.equal(suggestThreshold(Array(20).fill(30), 80)?.suggested, 50);
  assert.equal(suggestThreshold(Array(20).fill(30), 80)?.fine, true);
  assert.equal(suggestThreshold(Array(20).fill(99), 80)?.suggested, 98);
});

test("suggestThreshold needs enough frames", () => {
  assert.equal(suggestThreshold([10, 20], 80), null);
});
