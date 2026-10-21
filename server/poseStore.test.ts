import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultBuiltinPose, PoseStore } from "./poseStore.js";
import type { PosesFile } from "../src/types.js";

function makeFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "livechat-poses-"));
  return path.join(dir, "poses.json");
}

const legacy = () => ({
  poseAlertImageUrl: "/user-assets/a.jpg",
  poseAlertSoundUrl: "/user-assets/a.mp3",
  poseCooldownSeconds: 45,
});

test("migrates legacy settings when poses.json is missing", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  const poses = store.load();
  const pose = poses.poses[0];

  assert.equal(poses.version, 1);
  assert.equal(poses.poses.length, 1);
  assert.equal(pose.kind, "builtin");
  assert.equal(pose.media.type, "image");
  assert.equal(pose.media.imageUrl, "/user-assets/a.jpg");
  assert.equal(pose.media.soundUrl, "/user-assets/a.mp3");
  assert.equal(pose.cooldownSeconds, 45);
  assert.equal(pose.holdMs, 600);
  assert.ok(fs.existsSync(file));
});

test("recovers from invalid JSON", () => {
  const file = makeFile();
  fs.writeFileSync(file, "{nope");
  const store = new PoseStore(file, legacy);
  const poses = store.load();
  const backup = fs.readdirSync(path.dirname(file)).find((name) => name.startsWith("poses.json.bad-"));

  assert.equal(poses.version, 1);
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), backup), "utf8"), "{nope");
});

test("rejects an invalid save without touching the file", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  store.load();
  const before = fs.readFileSync(file, "utf8");
  const invalid = structuredClone(store.get()) as PosesFile;
  invalid.poses[0].threshold = 150;

  assert.throws(() => store.save(invalid));
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("save is atomic", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  const poses = store.load();
  store.save(poses);

  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), poses);
});

test("re-adds a removed builtin", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  store.load();
  store.save({ version: 1, poses: [], hiddenBuiltins: [] });

  assert.ok(store.get().poses.some((pose) => pose.id === "absolute-cinema"));
});

test("emits change on save", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  const poses = store.load();
  let changed: PosesFile | undefined;
  store.on("change", (next) => {
    changed = next;
  });
  store.save(poses);

  assert.deepEqual(changed, poses);
});

test("default builtin pose uses legacy settings", () => {
  const pose = defaultBuiltinPose(legacy());
  assert.equal(pose.id, "absolute-cinema");
  assert.equal(pose.builtinId, "absolute-cinema");
});

test("keeps the other media type's fields when switching type", () => {
  const store = new PoseStore(makeFile(), legacy);
  const current = store.load();
  const pose = current.poses[0];
  const switched = { ...pose, media: { ...pose.media, type: "video" as const, videoUrl: "/user-assets/v.mp4" } };
  store.save({ ...current, poses: [switched] });
  assert.equal(store.get().poses[0].media.imageUrl, "/user-assets/a.jpg");
  assert.equal(store.get().poses[0].media.videoUrl, "/user-assets/v.mp4");
});

const handTemplate = {
  fingers: { thumb: "any", index: "up", middle: "down", ring: "down", pinky: "any" },
  curls: { thumb: 0.2, index: 0, middle: 0.9, ring: 0.8, pinky: 0.5 },
  position: { x: 0.1, y: -0.2 },
  direction: { palm: 1.2, thumb: -0.4 },
} as const;

function customPose(overrides: Record<string, unknown> = {}) {
  const base = defaultBuiltinPose(legacy());
  return { ...base, id: "custom-1", name: "Custom", kind: "custom", builtinId: undefined, ...overrides } as never;
}

test("loads a file without hand fields unchanged", () => {
  const file = makeFile();
  const seeded = new PoseStore(file, legacy).load();
  const custom = customPose({ bodyParts: ["arms"] });
  fs.writeFileSync(file, JSON.stringify({ ...seeded, poses: [...seeded.poses, custom] }, null, 2));
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  const loaded = new PoseStore(file, legacy).load();
  assert.deepEqual(JSON.parse(JSON.stringify(loaded)), before);
});

test("saves a pose with hands", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  const current = store.load();
  const pose = customPose({
    bodyParts: ["leftHand"],
    hands: { left: handTemplate, gap: { x: 0.3, y: 0 } },
    handPosition: false,
  });
  store.save({ ...current, poses: [...current.poses, pose] });
  const back = new PoseStore(file, legacy).load().poses.find((p) => p.id === "custom-1");
  assert.deepEqual(back?.hands?.left, handTemplate);
  assert.equal(back?.handPosition, false);
});

test("rejects a ticked hand without its template", () => {
  const file = makeFile();
  const store = new PoseStore(file, legacy);
  const current = store.load();
  const before = fs.readFileSync(file, "utf8");
  const pose = customPose({ bodyParts: ["rightHand"], hands: { left: handTemplate } });
  assert.throws(() => store.save({ ...current, poses: [...current.poses, pose] }));
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("skips (not crashes) a hand-edited file with a ticked hand and no template", () => {
  const file = makeFile();
  const seeded = new PoseStore(file, legacy).load();
  const bad = customPose({ id: "bad-hand", bodyParts: ["leftHand"] });
  const good = customPose({ id: "good", bodyParts: ["arms"] });
  const original = JSON.stringify({ ...seeded, poses: [...seeded.poses, bad, good] });
  fs.writeFileSync(file, original);
  const loaded = new PoseStore(file, legacy).load();
  const ids = loaded.poses.map((p) => p.id);
  assert.ok(ids.includes("good"));
  assert.ok(!ids.includes("bad-hand"));
  const backup = fs.readdirSync(path.dirname(file)).find((n) => n.startsWith("poses.json.bad-"));
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), backup), "utf8"), original);
  assert.ok(!fs.readFileSync(file, "utf8").includes("bad-hand"));
});
