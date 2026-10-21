import assert from "node:assert/strict";
import test from "node:test";
import type { Pose, PosesFile } from "../types";
import { armsUp, tPose } from "./poseFixtures.js";
import { normalise } from "./poseMatcher.js";
import { detectablePoses, posesNeedHands, scoreFrame } from "./poseScoring.js";
import type { HandReading } from "./handCrop.js";
import { handSkeleton, openPalm, thumbsUp, victory } from "./handFixtures.js";
import { makeHandTemplate, scoreHand } from "./handMatcher.js";

const media = {
  type: "image" as const,
  imageUrl: "/user-assets/a.png",
  volume: 0.8,
  maxDurationSeconds: 30,
  fullscreen: true,
};
const custom = (id: string, extra: Partial<Pose> = {}): Pose => ({
  id,
  name: id,
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
const builtin: Pose = {
  ...custom("absolute-cinema"),
  kind: "builtin",
  builtinId: "absolute-cinema",
  template: undefined,
};

test("detectablePoses skips disabled, media-less, unrecorded and hidden poses", () => {
  const file: PosesFile = {
    version: 1,
    hiddenBuiltins: ["absolute-cinema"],
    poses: [
      custom("ok"),
      custom("off", { enabled: false }),
      custom("no-media", { media: { ...media, imageUrl: "" } }),
      custom("no-template", { template: undefined }),
      builtin,
    ],
  };
  assert.deepEqual(
    detectablePoses(file).map((p) => p.id),
    ["ok"]
  );
});

test("scoreFrame scores custom poses by template and the built-in by its rule", () => {
  const [a, b] = scoreFrame([custom("up"), builtin], armsUp, 1);
  assert.ok(a.score! >= 95);
  assert.equal(b.score, 100); // raised, spread arms are also the Absolute Cinema pose
  assert.equal(scoreFrame([builtin], tPose, 1)[0].score, null);
  assert.ok(scoreFrame([custom("up")], tPose, 1)[0].score! < 80);
});

test("scoreFrame without a person gives no score", () => {
  assert.deepEqual(
    scoreFrame([custom("up"), builtin], null, 1).map((s) => s.score),
    [null, null]
  );
});

const reading = (points: HandReading["points"]): HandReading => ({ points, score: 1, time: 0 });
const handTemplate = (points: HandReading["points"]) => makeHandTemplate([points], [armsUp], 1)!;
const handPose = (id: string, extra: Partial<Pose> = {}) =>
  custom(id, { bodyParts: ["rightHand"], template: undefined, hands: { right: handTemplate(thumbsUp) }, ...extra });
const score = (pose: Pose, hands: Parameters<typeof scoreFrame>[3], body = armsUp) =>
  scoreFrame([pose], body, 1, hands)[0].score;

test("hand poses need the hand to be seen", () => {
  assert.equal(score(handPose("h"), {}), null);
  assert.ok(score(handPose("h"), { right: reading(thumbsUp) })! >= 90);
});

test("a two-hand pose needs both hands in the frame", () => {
  const two = handPose("two", {
    bodyParts: ["leftHand", "rightHand"],
    hands: { left: handTemplate(thumbsUp), right: handTemplate(thumbsUp) },
  });
  assert.equal(score(two, { right: reading(thumbsUp) }), null);
  assert.ok(score(two, { left: reading(thumbsUp), right: reading(thumbsUp) })! >= 90);
});

test("a wrong hand cannot be hidden by a perfect body", () => {
  const pose = handPose("mix", { bodyParts: ["arms", "rightHand"], template: normalise(armsUp, 1)! });
  assert.ok(score(pose, { right: reading(thumbsUp) })! >= 90);
  assert.equal(score(pose, { right: reading(victory) }), null);
});

test("mirror lets the opposite hand match", () => {
  const mirroredUp = reading(thumbsUp.map((p) => ({ ...p, x: 1 - p.x })));
  assert.equal(score(handPose("m"), { left: mirroredUp }), null);
  assert.ok(score(handPose("m", { mirror: true }), { left: mirroredUp })! >= 85);
});

test("body-only poses are unaffected by hands", () => {
  assert.equal(score(custom("body"), { right: reading(openPalm) }), score(custom("body"), undefined));
});

test("detectablePoses requires a template for each ticked hand", () => {
  const file: PosesFile = {
    version: 1,
    hiddenBuiltins: [],
    poses: [handPose("ok"), handPose("none", { hands: {} })],
  };
  assert.deepEqual(
    detectablePoses(file).map((p) => p.id),
    ["ok"]
  );
});

test("posesNeedHands lists only the hands enabled poses use", () => {
  assert.deepEqual(posesNeedHands([custom("body")]), { left: false, right: false });
  assert.deepEqual(posesNeedHands([handPose("r")]), { left: false, right: true });
  assert.deepEqual(posesNeedHands([handPose("r", { enabled: false })]), { left: false, right: false });
  assert.deepEqual(posesNeedHands([handPose("r", { mirror: true })]), { left: true, right: true });
});

const STRAIGHT = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
const flipX = (points: HandReading["points"]) => points.map((p) => ({ ...p, x: 1 - p.x }));
const twoHands = (leftAt: [number, number], rightAt: [number, number], extra: Partial<Pose> = {}) => {
  const L = handSkeleton(STRAIGHT, { cx: leftAt[0], cy: leftAt[1] });
  const R = handSkeleton(STRAIGHT, { cx: rightAt[0], cy: rightAt[1] });
  const left = handTemplate(L);
  const right = handTemplate(R);
  const pose = custom("gap", {
    bodyParts: ["leftHand", "rightHand"],
    template: undefined,
    hands: { left, right, gap: { x: right.position.x - left.position.x, y: right.position.y - left.position.y } },
    ...extra,
  });
  return { pose, L, R };
};
const spread = () => [handSkeleton(STRAIGHT, { cx: 0.3 }), handSkeleton(STRAIGHT, { cx: 0.7 })] as const;

test("gap: hands at the recorded spacing pass", () => {
  const { pose, L, R } = twoHands([0.4, 0.5], [0.6, 0.5]);
  assert.ok(score(pose, { left: reading(L), right: reading(R) })! >= 95);
});

test("gap: the same hands far apart score clearly lower than without a recorded gap", () => {
  const { pose } = twoHands([0.4, 0.5], [0.6, 0.5]);
  const [L, R] = spread();
  const withGap = score(pose, { left: reading(L), right: reading(R) })!;
  const noGap = score({ ...pose, hands: { ...pose.hands!, gap: undefined } }, { left: reading(L), right: reading(R) })!;
  assert.ok(withGap < noGap - 3, `${withGap} vs ${noGap}`);
});

test("gap: mirrored performance passes with mirror on, not off", () => {
  const { pose, L, R } = twoHands([0.45, 0.5], [0.75, 0.6], { mirror: true });
  const live = { left: reading(flipX(R)), right: reading(flipX(L)) };
  assert.ok(score(pose, live)! >= 90);
  assert.ok((score({ ...pose, mirror: false }, live) ?? 0) < 80);
});

test("gap: has no effect when hand position is off", () => {
  const { pose } = twoHands([0.4, 0.5], [0.6, 0.5], { handPosition: false });
  const [L, R] = spread();
  const live = { left: reading(L), right: reading(R) };
  const noGap = score({ ...pose, hands: { ...pose.hands!, gap: undefined } }, live);
  assert.equal(score(pose, live), noGap);
  assert.ok(noGap! >= 95);
});

test("mirror flips the template: a sideways, off-centre right hand is matched by the left", () => {
  const right = handSkeleton(
    { thumb: 0, index: 1, middle: 1, ring: 1, pinky: 1 },
    { cx: 0.75, thumbAngle: 0.9, angle: Math.PI / 2 }
  );
  const template = handTemplate(right);
  const pose = handPose("flip", { hands: { right: template }, mirror: true });
  const leftReading = flipX(right);
  assert.ok(score(pose, { left: reading(leftReading) })! >= 80);
  // Without the flip (un-mirrored template against the swapped reading) it is clearly wrong
  assert.ok(scoreHand(leftReading, armsUp, 1, template, { position: true, direction: true }) < 50);
});
