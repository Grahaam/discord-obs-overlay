import assert from "node:assert/strict";
import test from "node:test";
import type { Pose, PosesFile } from "../types";
import { armsUp, tPose } from "./poseFixtures.js";
import { normalise } from "./poseMatcher.js";
import { detectablePoses, posesNeedHands, scoreFrame } from "./poseScoring.js";
import type { HandReading } from "./handCrop.js";
import { openPalm, thumbsUp, victory } from "./handFixtures.js";
import { makeHandTemplate } from "./handMatcher.js";

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
