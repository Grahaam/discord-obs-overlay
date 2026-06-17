import test from "node:test";
import assert from "node:assert";

// isYtDlpReady() starts false before warmUpYtDlp() is called.
// warmUpYtDlp/execFile and the socket wiring are integration points verified
// by typecheck + build rather than unit tests.
test("isYtDlpReady starts false", async () => {
  // Import fresh module via dynamic import; the module-level _ytDlpReady
  // is false before any warm-up call.
  const { isYtDlpReady } = await import("./mediaParser.js");
  assert.strictEqual(isYtDlpReady(), false);
});
