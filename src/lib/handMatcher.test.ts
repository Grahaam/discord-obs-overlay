import assert from "node:assert/strict";
import test from "node:test";
import type { HandTemplate, Pose } from "../types";
import {
  fingerCurls,
  fingerState,
  gapScore,
  handsLookAlike,
  makeHandTemplate,
  mirrorHands,
  scoreHand,
} from "./handMatcher.js";
import { fist, handSkeleton, openPalm, thumbsDown, thumbsUp, threeFingers, victory } from "./handFixtures.js";
import { armsUp } from "./poseFixtures.js";

const template = (points: typeof openPalm, opts = {}): HandTemplate => {
  const t = makeHandTemplate([points], [armsUp], 1);
  assert.ok(t);
  return { ...t, ...opts };
};
const both = { position: true, direction: true };

test("fingerCurls reads open, closed and mixed hands", () => {
  const open = fingerCurls(openPalm);
  assert.ok(open.index < 0.35 && open.middle < 0.35 && open.ring < 0.35 && open.pinky < 0.35 && open.thumb < 0.45);
  const closed = fingerCurls(fist);
  for (const v of Object.values(closed)) assert.ok(v > 0.6);
  const v = fingerCurls(victory);
  assert.ok(v.index < 0.35 && v.middle < 0.35 && v.ring > 0.6 && v.pinky > 0.6);
  const up = fingerCurls(thumbsUp);
  assert.ok(up.thumb < 0.45 && up.index > 0.6 && up.middle > 0.6 && up.ring > 0.6 && up.pinky > 0.6);
});

test("fingerState is any between the cutoffs", () => {
  assert.equal(fingerState("index", 0.2), "up");
  assert.equal(fingerState("index", 0.8), "down");
  assert.equal(fingerState("index", 0.5), "any");
  assert.equal(fingerState("thumb", 0.5), "any");
  assert.equal(fingerState("thumb", 0.4), "up");
});

test("scoreHand matches the same shape and rejects a different one", () => {
  assert.ok(scoreHand(victory, armsUp, 1, template(victory), both) >= 90);
  assert.ok(scoreHand(victory, armsUp, 1, template(threeFingers), both) < 50);
});

test("a finger marked any is ignored", () => {
  const t = template(threeFingers);
  assert.ok(scoreHand(victory, armsUp, 1, t, both) < 50);
  const loose = { ...t, fingers: { ...t.fingers, ring: "any" as const } };
  assert.ok(scoreHand(victory, armsUp, 1, loose, both) >= 90);
});

test("direction separates thumbs up from thumbs down", () => {
  const t = template(thumbsDown);
  assert.ok(scoreHand(thumbsUp, armsUp, 1, t, { position: false, direction: false }) >= 90);
  assert.ok(scoreHand(thumbsUp, armsUp, 1, t, { position: false, direction: true }) < 50);
  assert.ok(scoreHand(thumbsUp, armsUp, 1, t, both) < 50);
});

test("a moderately tilted hand still passes the direction gate", () => {
  const tilted = handSkeleton(
    { thumb: 0, index: 1, middle: 1, ring: 1, pinky: 1 },
    { thumbAngle: 0.9, angle: Math.PI / 6 }
  );
  assert.ok(scoreHand(tilted, armsUp, 1, template(thumbsUp), { position: false, direction: true }) >= 80);
});

test("position matters only when switched on", () => {
  const t = template(openPalm);
  const away = handSkeleton({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, { cx: 0.5 + 1.2 * 0.2 });
  assert.ok(scoreHand(away, armsUp, 1, t, both) < 80);
  assert.ok(scoreHand(away, armsUp, 1, t, { position: false, direction: true }) >= 90);
});

test("gapScore: touching matches, apart does not", () => {
  assert.ok(gapScore({ x: 0.2, y: 0 }, { x: 0.2, y: 0 }) >= 0.9);
  assert.ok(gapScore({ x: 1.5, y: 0 }, { x: 0.2, y: 0 }) <= 0.1);
});

test("mirrorHands swaps hands and flips them", () => {
  const left = template(openPalm, { position: { x: -1, y: 0.5 } });
  const right = template(fist, { position: { x: 1.5, y: 0.2 } });
  const m = mirrorHands({ left, right, gap: { x: 0.4, y: 0.1 } });
  assert.equal(m.left?.fingers.index, "down");
  assert.equal(m.right?.fingers.index, "up");
  assert.equal(m.left?.position.x, -1.5);
  assert.equal(m.right?.position.x, 1);
  assert.equal(m.left?.direction.palm, Math.PI - right.direction.palm);
  // right − left of the mirrored pair: x is unchanged, y changes sign
  assert.deepEqual(m.gap, { x: 0.4, y: -0.1 });
});

test("handsLookAlike", () => {
  const pose = (t: HandTemplate): Pose => ({ bodyParts: ["rightHand"], hands: { right: t } }) as unknown as Pose;
  assert.equal(handsLookAlike(pose(template(thumbsUp)), pose(template(thumbsUp))), true);
  assert.equal(handsLookAlike(pose(template(thumbsUp)), pose(template(victory))), false);
});
