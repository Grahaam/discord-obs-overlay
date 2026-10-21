import assert from "node:assert/strict";
import test from "node:test";
import { assignToWrists } from "./hands.js";
import { handSkeleton } from "./handFixtures.js";
import { armsUp } from "./poseFixtures.js";

test("assignToWrists", () => {
  const left = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.25, cy: 0.15 });
  const right = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.75, cy: 0.15 });
  const out = assignToWrists([right, left], armsUp);
  assert.equal(out.left, left);
  assert.equal(out.right, right);
});

test("assignToWrists gives both sides when both hands are nearest one wrist", () => {
  const a = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.24, cy: 0.15 });
  const b = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.3, cy: 0.15 });
  const out = assignToWrists([a, b], armsUp);
  assert.equal(out.left, a);
  assert.equal(out.right, b);
});

test("assignToWrists skips a hidden wrist", () => {
  const hand = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.26, cy: 0.15 });
  const body = armsUp.map((p, i) => (i === 15 ? { ...p, visibility: 0.2 } : p));
  const out = assignToWrists([hand], body);
  assert.equal(out.left, undefined);
  assert.equal(out.right, hand);
});

test("assignToWrists tolerates empty hands and missing wrists", () => {
  const hand = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 });
  assert.deepEqual(assignToWrists([[]], armsUp), {});
  assert.deepEqual(assignToWrists([hand], []), {});
});
