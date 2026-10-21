import assert from "node:assert/strict";
import type { Pose } from "../types";
import test from "node:test";
import type { HandReading } from "./hands.js";
import { handSkeleton, openPalm, victory } from "./handFixtures.js";
import { handCentre } from "./handMatcher.js";
import {
  buildRecording,
  clearFrame,
  liveHandFor,
  mergeHandRecording,
  recordParts,
  ticksToParts,
  type RecordedFrame,
} from "./handRecording.js";
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

test("liveHandFor uses the same side, else the opposite one when mirrored", () => {
  const live = { right: "R" };
  assert.equal(liveHandFor("right", live, false), "R");
  assert.equal(liveHandFor("left", live, false), undefined);
  assert.equal(liveHandFor("left", live, true), "R");
  assert.equal(liveHandFor("left", { left: "L", right: "R" }, true), "L");
});

test("mergeHandRecording adds the recorded part and keeps other templates", () => {
  const old = buildRecording(times(MIN_GOOD_FRAMES, frame({ left: reading(openPalm) })), ["leftHand"]).hands!;
  const pose = { bodyParts: ["arms", "head"], template: [], hands: { left: old.left } } as unknown as Pose;
  const result = buildRecording(times(MIN_GOOD_FRAMES, frame({ right: reading(victory) })), ["rightHand"]);
  const next = mergeHandRecording(pose, result, ["rightHand"]);
  assert.deepEqual(next.bodyParts, ["arms", "head", "rightHand"]);
  assert.equal(next.hands?.left, old.left);
  assert.ok(next.hands?.right);
  assert.equal(next.template, pose.template);
  assert.deepEqual(mergeHandRecording(next, result, ["rightHand"]).bodyParts, ["arms", "head", "rightHand"]);
});

test("re-recording one hand of a two-hand pose drops the stale gap", () => {
  const twoHands = frame({ left: reading(leftPoints), right: reading(rightPoints) });
  const first = buildRecording(times(MIN_GOOD_FRAMES, twoHands), ["leftHand", "rightHand"]);
  assert.ok(first.hands?.gap);
  const pose = { bodyParts: ["leftHand", "rightHand"], template: [], hands: first.hands } as unknown as Pose;

  const leftOnly = buildRecording(times(MIN_GOOD_FRAMES, frame({ left: reading(openPalm) })), ["leftHand"]);
  const afterLeft = mergeHandRecording(pose, leftOnly, ["leftHand"]);
  assert.equal(afterLeft.hands?.gap, undefined);
  assert.ok(afterLeft.hands?.right);

  const again = buildRecording(times(MIN_GOOD_FRAMES, twoHands), ["leftHand", "rightHand"]);
  const afterBoth = mergeHandRecording({ ...pose, hands: { ...first.hands, gap: { x: 9, y: 9 } } } as Pose, again, [
    "leftHand",
    "rightHand",
  ]);
  assert.deepEqual(afterBoth.hands?.gap, again.hands?.gap);
});
