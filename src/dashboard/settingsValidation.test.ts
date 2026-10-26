import { test } from "node:test";
import assert from "node:assert/strict";
import { isSavable } from "./settingsValidation.js";
import type { UIConfig } from "../types.js";

const base = {
  alertDuration: 8000,
  mediaMaxSizeMB: 50,
  cooldownSeconds: 1,
  neonColor: "#6366f1",
} as UIConfig;

test("accepts a valid config", () => {
  assert.equal(isSavable(base), true);
});

test("rejects values that the server would answer with a 400", () => {
  assert.equal(isSavable({ ...base, alertDuration: 8 }), false);
  assert.equal(isSavable({ ...base, mediaMaxSizeMB: 0 }), false);
  assert.equal(isSavable({ ...base, cooldownSeconds: 0 }), false);
  assert.equal(isSavable({ ...base, obsWebsocketPort: 70000 }), false);
  assert.equal(isSavable({ ...base, alertDuration: Number.NaN }), false);
  assert.equal(isSavable({ ...base, neonColor: "6366f1" }), false);
});

test("ignores optional fields that are not set", () => {
  assert.equal(isSavable({ ...base, alertScale: undefined, poseCooldownSeconds: undefined }), true);
});
