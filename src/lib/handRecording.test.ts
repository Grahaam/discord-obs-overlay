import assert from "node:assert/strict";
import test from "node:test";
import type { HandReading } from "./handCrop.js";
import { handSkeleton, openPalm, victory } from "./handFixtures.js";
import { handCentre } from "./handMatcher.js";
import { buildRecording, clearFrame, recordParts, ticksToParts, type RecordedFrame } from "./handRecording.js";
import { armsUp } from "./poseFixtures.js";
import { MIN_GOOD_FRAMES } from "./poseMatcher.js";

const reading = (points: HandReading["points"]): HandReading => ({ points, score: 1, time: 0 });
const frame = (hands: RecordedFrame["hands"] = {}): RecordedFrame => ({ landmarks: armsUp, aspect: 1, hands });
const times = (n: number, f: RecordedFrame) => Array.from({ length: n }, () => f);
const leftPoints = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.3 });
const rightPoints = handSkeleton({ thumb: 1, index: 0, middle: 0, ring: 1, pinky: 1 }, { cx: 0.7 });

test("recordParts orders body, left hand, right hand", () => {
  assert.deepEqual(recordParts(["rightHand", "arms", "leftHand"]), ["body", "leftHand", "rightHand"]);
  assert.deepEqual(recordParts(["rightHand"]), ["rightHand"]);
});

test("clearFrame needs every ticked part", () => {
  assert.ok(clearFrame(frame(), ["arms", "head"]));
  assert.ok(!clearFrame(frame(), ["arms", "rightHand"]));
  assert.ok(clearFrame(frame({ right: reading(victory) }), ["arms", "rightHand"]));
  assert.ok(clearFrame(frame({ right: reading(victory) }), ["rightHand"]));
  assert.ok(!clearFrame({ landmarks: null, aspect: 1 }, ["rightHand"]));
});

test("body-only recording keeps the old template", () => {
  const result = buildRecording(times(MIN_GOOD_FRAMES, frame()), ["arms", "head"]);
  assert.ok(result.template);
  assert.equal(result.hands, undefined);
  assert.equal(result.error, undefined);
});

test("hand-only recording has no body template and no body error", () => {
  const result = buildRecording(times(MIN_GOOD_FRAMES, frame({ right: reading(victory) })), ["rightHand"]);
  assert.equal(result.template, null);
  assert.equal(result.error, undefined);
  assert.equal(result.hands?.right?.fingers.index, "up");
  assert.equal(result.hands?.right?.fingers.ring, "down");
});

test("both hands average the gap (right centre minus left centre)", () => {
  const f = frame({ left: reading(leftPoints), right: reading(rightPoints) });
  const result = buildRecording(times(MIN_GOOD_FRAMES, f), ["leftHand", "rightHand"]);
  const l = handCentre(leftPoints, armsUp, 1)!;
  const r = handCentre(rightPoints, armsUp, 1)!;
  assert.ok(result.hands?.gap);
  assert.ok(Math.abs(result.hands.gap.x - (r.x - l.x)) < 1e-9);
  assert.ok(Math.abs(result.hands.gap.y - (r.y - l.y)) < 1e-9);
  assert.ok(result.hands.left && result.hands.right);
});

test("too few clear frames names the first part seen too rarely", () => {
  const parts = ["arms", "leftHand", "rightHand"] as const;
  const few = times(3, frame({ left: reading(openPalm), right: reading(victory) }));
  assert.equal(buildRecording(few, [...parts], { body: 20, leftHand: 20, rightHand: 2 }).error, "rightHand");
  assert.equal(buildRecording(few, [...parts], { body: 20, leftHand: 4, rightHand: 2 }).error, "leftHand");
  assert.equal(buildRecording(few, [...parts], { body: 1, leftHand: 4, rightHand: 2 }).error, "body");
  assert.equal(buildRecording(few, [...parts]).template, null);
});

test("ticksToParts maps Body to arms + head", () => {
  assert.deepEqual(ticksToParts({ body: true, leftHand: false, rightHand: true }), ["arms", "head", "rightHand"]);
  assert.deepEqual(ticksToParts({ body: false, leftHand: false, rightHand: false }), []);
});
