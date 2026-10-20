import assert from "node:assert/strict";
import test from "node:test";
import { assignToWrists, cropToFrame, frameToCrop, handCrop, mergeCrops, type HandReading } from "./handCrop.js";
import { handSkeleton, openPalm } from "./handFixtures.js";
import { armsUp, skeleton } from "./poseFixtures.js";

const frame = { width: 640, height: 480 };

test("crop is centred on the hand and big enough", () => {
  const body = skeleton({
    11: [0.4, 0.5],
    13: [0.32, 0.35],
    15: [0.25, 0.15],
    17: [0.22, 0.1],
    19: [0.24, 0.09],
    21: [0.27, 0.11],
  });
  const box = handCrop(body, "left", frame)!;
  assert.ok(box.size >= 96);
  const pts = [15, 17, 19, 21].map((i) => body[i]);
  const mx = (pts.reduce((s, p) => s + p.x, 0) / 4) * frame.width;
  const my = (pts.reduce((s, p) => s + p.y, 0) / 4) * frame.height;
  assert.ok(Math.hypot(box.cx - mx, box.cy - my) < 0.2 * box.size);
  // elbow -> wrist is mapped straight up in crop space
  const e = frameToCrop({ x: 0.32, y: 0.35, z: 0 }, box, frame);
  const w = frameToCrop({ x: 0.25, y: 0.15, z: 0 }, box, frame);
  assert.ok(Math.abs(w.x - e.x) < 1e-6 && w.y < e.y);
});

test("hidden wrist gives no crop", () => {
  const body = armsUp.map((p, i) => (i === 15 ? { ...p, visibility: 0.3 } : p));
  assert.equal(handCrop(body, "left", frame), null);
  assert.ok(handCrop(body, "right", frame));
});

test("edge hand stays centred", () => {
  const body = skeleton({
    12: [0.9, 0.5],
    14: [0.95, 0.4],
    16: [0.98, 0.3],
    18: [0.98, 0.3],
    20: [0.98, 0.3],
    22: [0.98, 0.3],
  });
  const box = handCrop(body, "right", frame)!;
  assert.ok(box.cx > frame.width - box.size / 2);
});

test("round trip", () => {
  const box = { cx: 300, cy: 200, size: 150, angle: 0.7 };
  const p = { x: 0.4, y: 0.6, z: 0.05 };
  const back = cropToFrame(frameToCrop(p, box, frame), box, frame);
  assert.ok(Math.abs(back.x - p.x) < 1e-6 && Math.abs(back.y - p.y) < 1e-6);
  assert.equal(back.z, p.z);
});

test("follows the previous hand within 500 ms, falls back after", () => {
  const points = openPalm.map((p) => ({ ...p, x: 0.7 + (p.x - 0.5) * 0.2, y: 0.7 + (p.y - 0.5) * 0.2 }));
  const previous: HandReading = { points, score: 1, time: 0 };
  const xs = points.map((p) => p.x * frame.width);
  const ys = points.map((p) => p.y * frame.height);
  const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const followed = handCrop(armsUp, "left", frame, previous, 400)!;
  assert.ok(Math.abs(followed.size - side * 1.3) < 1e-6);
  assert.ok(Math.abs(followed.cx - (Math.max(...xs) + Math.min(...xs)) / 2) < 1e-6);
  const fallback = handCrop(armsUp, "left", frame, previous, 600)!;
  assert.deepEqual(fallback, handCrop(armsUp, "left", frame)!);
  assert.notEqual(fallback.cx, followed.cx);
});

test("merge", () => {
  const a = { cx: 100, cy: 100, size: 100, angle: 0 };
  const half = mergeCrops(a, { cx: 150, cy: 100, size: 100, angle: 0 })!;
  assert.ok(half.cx - half.size / 2 <= 50 && half.cx + half.size / 2 >= 200);
  assert.ok(half.cy - half.size / 2 <= 50 && half.cy + half.size / 2 >= 150);
  assert.equal(mergeCrops(a, { cx: 170, cy: 100, size: 100, angle: 0 }), null);
});

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
