import assert from "node:assert/strict";
import test from "node:test";
import type { Pose, PosesFile } from "../types";
import { armsUp, tPose } from "./poseFixtures.js";
import { normalise } from "./poseMatcher.js";
import { detectablePoses, scoreFrame } from "./poseScoring.js";

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
