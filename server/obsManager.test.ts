import test from "node:test";
import assert from "node:assert";
import { classifyObsError } from "./obsManager.js";

test("classifyObsError: close code 4009 is a wrong password", () => {
  assert.strictEqual(classifyObsError({ code: 4009, message: "Authentication failed." }), "auth_failed");
});

test("classifyObsError: refused or timed-out connections are unreachable", () => {
  assert.strictEqual(classifyObsError({ code: "ECONNREFUSED" }), "unreachable");
  assert.strictEqual(classifyObsError({ code: "TEST_TIMEOUT" }), "unreachable");
  assert.strictEqual(classifyObsError({ code: 1006 }), "unreachable");
});

test("classifyObsError: anything else is other", () => {
  assert.strictEqual(classifyObsError(new Error("boom")), "other");
  assert.strictEqual(classifyObsError(undefined), "other");
});
