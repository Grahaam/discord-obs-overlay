import test from "node:test";
import assert from "node:assert";
import { readEnvVar, upsertEnvVar } from "./envFile.js";

test("upsertEnvVar replaces an existing key and keeps $ sequences literal", () => {
  const out = upsertEnvVar('A="1"\nPW="old"\nB="2"', "PW", "pa$$word$&x");
  assert.strictEqual(out, 'A="1"\nPW="pa$$word$&x"\nB="2"');
});

test("upsertEnvVar appends a missing key and escapes quotes", () => {
  assert.strictEqual(upsertEnvVar('A="1"', "PW", 'a"b'), 'A="1"\nPW="a\\"b"');
});

test("readEnvVar is the exact inverse of upsertEnvVar", () => {
  const passwords = ['a"b', "a\\b", "end\\", 'q"\\"', "pa$$w$&rd#x y", "tab\\n", "#hash", " spaced "];
  for (const pw of passwords) {
    const env = upsertEnvVar('A="1"', "PW", pw);
    assert.strictEqual(readEnvVar(env, "PW"), pw, pw);
    assert.strictEqual(readEnvVar(env, "A"), "1");
  }
});

test("readEnvVar returns undefined for a missing key", () => {
  assert.strictEqual(readEnvVar('A="1"', "PW"), undefined);
});
