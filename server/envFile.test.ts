import test from "node:test";
import assert from "node:assert";
import { upsertEnvVar } from "./envFile.js";

test("upsertEnvVar replaces an existing key and keeps $ sequences literal", () => {
  const out = upsertEnvVar('A="1"\nPW="old"\nB="2"', "PW", "pa$$word$&x");
  assert.strictEqual(out, 'A="1"\nPW="pa$$word$&x"\nB="2"');
});

test("upsertEnvVar appends a missing key and escapes quotes", () => {
  assert.strictEqual(upsertEnvVar('A="1"', "PW", 'a"b'), 'A="1"\nPW="a\\"b"');
});
