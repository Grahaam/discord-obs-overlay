import assert from "node:assert/strict";
import test from "node:test";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { armsUp } from "./poseFixtures.js";
import { runHandPass } from "./handPass.js";

// A hand of 21 points around (x, y), as the model returns them (frame fractions)
const hand = (x: number, y: number) => Array.from({ length: 21 }, (_, i) => ({ x: x + i * 0.001, y, z: 0 }));
const stub = (hands: ReturnType<typeof hand>[]) => {
  const calls: unknown[] = [];
  const landmarker = {
    detect: (img: unknown) => {
      calls.push(img);
      return { landmarks: hands, handedness: hands.map(() => [{ score: 0.9 }]), worldLandmarks: [] };
    },
  } as unknown as HandLandmarker;
  return { landmarker, calls };
};
const source = { width: 640, height: 480 } as ImageBitmap;
// armsUp wrists: left (15) at x 0.25, right (16) at x 0.75
const left = hand(0.25, 0.15);
const right = hand(0.75, 0.15);

test("one model call on the whole frame finds both hands and assigns them to the nearest wrist", () => {
  const { landmarker, calls } = stub([right, left]);
  const { hands } = runHandPass({ landmarker, source, body: armsUp, sides: { left: true, right: true }, now: 5 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], source);
  assert.equal(hands.left?.points[0].x, left[0].x);
  assert.equal(hands.right?.points[0].x, right[0].x);
  assert.equal(hands.right?.score, 0.9);
  assert.equal(hands.right?.time, 5);
});

test("only the requested sides are returned", () => {
  const { landmarker } = stub([right, left]);
  const { hands } = runHandPass({ landmarker, source, body: armsUp, sides: { left: false, right: true }, now: 0 });
  assert.equal(hands.left, undefined);
  assert.ok(hands.right);
});

test("no hand found gives no readings", () => {
  const { landmarker } = stub([]);
  assert.deepEqual(
    runHandPass({ landmarker, source, body: armsUp, sides: { left: true, right: true }, now: 0 }).hands,
    {}
  );
});
