import assert from "node:assert/strict";
import test from "node:test";
import type { Pose } from "../src/types.js";
import { createPoseAlertController } from "./poseAlert.js";

function pose(id: string, overrides: Partial<Pose> = {}): Pose {
  return {
    id,
    name: id,
    kind: "custom",
    enabled: true,
    bodyParts: ["arms", "head"],
    threshold: 80,
    mirror: true,
    holdMs: 600,
    cooldownSeconds: 30,
    media: {
      type: "image",
      imageUrl: `/user-assets/${id}.png`,
      volume: 0.8,
      durationSeconds: 4,
      maxDurationSeconds: 30,
      fullscreen: true,
    },
    ...overrides,
  };
}

function clock() {
  let now = 0;
  const timers = new Map<number, () => void>();
  let nextId = 0;
  return {
    now: () => now,
    setTimer: (fn: () => void, delay: number) => {
      const id = ++nextId;
      timers.set(id, () => {
        now += delay;
        fn();
      });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id: ReturnType<typeof setTimeout>) => timers.delete(id as unknown as number),
    runAll: () => [...timers.values()].forEach((fn) => fn()),
    advance: (ms: number) => {
      now += ms;
      [...timers.values()].forEach((fn) => fn());
    },
  };
}

test("fires an enabled pose with media and sets playing", () => {
  const c = clock();
  const controller = createPoseAlertController({
    getPoses: () => [pose("a")],
    isEnabled: () => true,
    now: c.now,
    setTimer: c.setTimer as unknown as typeof setTimeout,
    clearTimer: c.clearTimer as unknown as typeof clearTimeout,
    onStuck: () => {},
  });

  const alert = controller.trigger("a");
  assert.equal(alert?.poseId, "a");
  assert.equal(alert?.media.imageUrl, "/user-assets/a.png");
  assert.equal(controller.isPlaying(), true);
});

test("rejects unknown, disabled, hidden or media-less poses", () => {
  const cases = [
    () => [],
    () => [pose("a", { enabled: false })],
    () => [],
    () => [pose("a", { media: { ...pose("a").media, imageUrl: "" } })],
  ];
  for (const getPoses of cases) {
    const controller = createPoseAlertController({
      getPoses,
      isEnabled: () => true,
      now: () => 0,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
      onStuck: () => {},
    });
    assert.equal(controller.trigger("a"), null);
  }
});

test("per-pose cooldowns are independent", () => {
  let now = 0;
  const controller = createPoseAlertController({
    getPoses: () => [pose("a"), pose("b")],
    isEnabled: () => true,
    now: () => now,
    setTimer: setTimeout,
    clearTimer: clearTimeout,
    onStuck: () => {},
  });
  assert.ok(controller.trigger("a"));
  controller.done();
  assert.ok(controller.trigger("b"));
  controller.done();
  assert.equal(controller.trigger("a"), null);
  now = 30_000;
  assert.ok(controller.trigger("a"));
});

test("one at a time", () => {
  const controller = createPoseAlertController({
    getPoses: () => [pose("a"), pose("b")],
    isEnabled: () => true,
    now: () => 0,
    setTimer: setTimeout,
    clearTimer: clearTimeout,
    onStuck: () => {},
  });
  assert.ok(controller.trigger("a"));
  assert.equal(controller.trigger("b"), null);
  controller.done();
  assert.ok(controller.trigger("b"));
});

test("master switch off rejects normal triggers but preview ignores it and cooldown", () => {
  const c = clock();
  const controller = createPoseAlertController({
    getPoses: () => [pose("a")],
    isEnabled: () => false,
    now: c.now,
    setTimer: c.setTimer as unknown as typeof setTimeout,
    clearTimer: c.clearTimer as unknown as typeof clearTimeout,
    onStuck: () => {},
  });
  assert.equal(controller.trigger("a"), null);
  assert.ok(controller.trigger("a", { ignoreCooldown: true }));
});

test("stuck alert clears after maxDurationSeconds + 5 s and calls onStuck", () => {
  const c = clock();
  let stuck = 0;
  const controller = createPoseAlertController({
    getPoses: () => [pose("a", { media: { ...pose("a").media, maxDurationSeconds: 5 } })],
    isEnabled: () => true,
    now: c.now,
    setTimer: c.setTimer as unknown as typeof setTimeout,
    clearTimer: c.clearTimer as unknown as typeof clearTimeout,
    onStuck: () => stuck++,
  });
  controller.trigger("a");
  assert.equal(controller.isPlaying(), true);
  c.advance(10_000);
  assert.equal(controller.isPlaying(), false);
  assert.equal(stuck, 1);
});
