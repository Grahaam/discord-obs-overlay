import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionFromPath, SECTION_IDS, SECTION_PATH } from "./sections.js";

test("every section maps back from its own path", () => {
  for (const id of SECTION_IDS) assert.equal(sectionFromPath(SECTION_PATH[id]), id);
});

test("tolerates a trailing slash and unknown paths", () => {
  assert.equal(sectionFromPath("/look/"), "look");
  assert.equal(sectionFromPath("/nope"), "live");
  assert.equal(sectionFromPath(""), "live");
});
