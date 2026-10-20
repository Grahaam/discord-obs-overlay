import assert from "node:assert/strict";
import test from "node:test";
import { armsUp, handsOnHead, rightArmUp, skeleton, tPose } from "./poseFixtures.js";
import { averageTemplate, createHoldTracker, normalise, scorePose } from "./poseMatcher.js";

const arms = { bodyParts: ["arms"] as ["arms"], mirror: false };
const n = (points: ReturnType<typeof skeleton>) => normalise(points, 1)!;

test("same pose scores highly and different poses score low", () => {
  assert.ok(scorePose(n(armsUp), n(armsUp), arms)! >= 95);
  // 63 since angles wrap correctly (the T-pose arm sits on atan2's ±180° seam); still far below the 80 default
  assert.ok(scorePose(n(armsUp), n(tPose), arms)! < 70);
  assert.ok(scorePose(n(handsOnHead), n(armsUp), arms)! < 80);
});

test("normalisation removes translation and scale", () => {
  const base = n(armsUp);
  const shifted = armsUp.map((point) => ({ ...point, x: 0.2 + 0.5 * point.x, y: 0.5 + 0.5 * point.y }));
  const transformed = normalise(shifted, 1)!;
  assert.ok(Math.abs(scorePose(base, base, arms)! - scorePose(transformed, base, arms)!) <= 2);
});

test("aspect ratio is handled during normalisation", () => {
  const wide = armsUp.map((point) => ({ ...point, x: point.x * (16 / 9) }));
  assert.notEqual(scorePose(n(armsUp), n(wide), arms), 100);
  assert.ok(scorePose(normalise(armsUp, 16 / 9)!, normalise(wide, 1)!, arms)! >= 95);
});

test("mirror matching can be enabled", () => {
  const leftArmUp = skeleton({
    11: [0.4, 0.5],
    12: [0.6, 0.5],
    13: [0.3, 0.35],
    14: [0.7, 0.35],
    15: [0.2, 0.45],
    16: [0.8, 0.15],
  });
  assert.ok(scorePose(n(rightArmUp), n(rightArmUp), arms)! >= 95);
  assert.ok(scorePose(n(rightArmUp), n(leftArmUp), { ...arms, mirror: true })! >= 95);
  assert.ok(scorePose(n(rightArmUp), n(leftArmUp), arms)! < 70);
});

test("low visibility in masked joints returns null", () => {
  const lowWrist = armsUp.map((point, index) => (index === 15 ? { ...point, visibility: 0.2 } : point));
  assert.equal(scorePose(n(lowWrist), n(armsUp), arms), null);
  assert.notEqual(scorePose(n(lowWrist), n(armsUp), { bodyParts: ["head"], mirror: false }), null);
});

test("averageTemplate requires ten good frames", () => {
  assert.equal(averageTemplate(Array(9).fill(armsUp), 1, ["arms"]), null);
  assert.ok(averageTemplate([...Array(12).fill(armsUp), ...Array(5).fill(lowVisibility())], 1, ["arms"]));
});

function lowVisibility() {
  return armsUp.map((point, index) => (index === 15 ? { ...point, visibility: 0.2 } : point));
}

test("hold tracker applies timing, hysteresis, best match and deletion", () => {
  const tracker = createHoldTracker();
  const score = (value: number, poseId = "a") => [{ poseId, score: value, threshold: 80, holdMs: 600 }];
  assert.equal(tracker.update(score(90), 0), null);
  assert.equal(tracker.update(score(90), 599), null);
  assert.equal(tracker.update(score(90), 600), "a");
  assert.equal(tracker.update(score(90), 700), null);
  assert.equal(tracker.update(score(77), 800), null);
  assert.equal(tracker.update(score(74), 900), null);
  assert.equal(tracker.update([], 1000), null);
  assert.equal(tracker.update(score(90), 1000), null);
  assert.equal(tracker.update(score(90), 1600), "a");
});

test("an arm pointing sideways still matches when the wrist jitters across the horizontal", () => {
  // atan2 jumps from +180° to -180° there: a one-pixel wobble must not drop the score
  const up = skeleton({
    11: [0.4, 0.5],
    12: [0.6, 0.5],
    13: [0.25, 0.5],
    14: [0.75, 0.5],
    15: [0.1, 0.499],
    16: [0.9, 0.5],
  });
  const down = skeleton({
    11: [0.4, 0.5],
    12: [0.6, 0.5],
    13: [0.25, 0.5],
    14: [0.75, 0.5],
    15: [0.1, 0.501],
    16: [0.9, 0.5],
  });
  assert.ok(scorePose(n(up), n(down), arms)! >= 95);
});
