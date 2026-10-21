import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanupUnusedUploads, safeAssetName, UPLOAD_NAME_RE, validateUpload } from "./userAssets.js";

test("validates supported upload signatures and limits", () => {
  assert.deepEqual(validateUpload("x.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]), 4), {
    ok: true,
    ext: "png",
    kind: "image",
  });
  assert.deepEqual(validateUpload("x.mp4", Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]), 49 * 1024 * 1024), {
    ok: true,
    ext: "mp4",
    kind: "video",
  });
  assert.deepEqual(validateUpload("x.mp3", Buffer.from("ID3"), 3), { ok: true, ext: "mp3", kind: "audio" });
  assert.deepEqual(validateUpload("x.png", Buffer.from("MZ"), 2), { ok: false, error: "type" });
  assert.deepEqual(validateUpload("x.gif", Buffer.from("GIF8"), 11 * 1024 * 1024), { ok: false, error: "size" });
});

test("sanitizes upload names", () => {
  const traversal = safeAssetName("../../settings.json", "png");
  assert.match(traversal, UPLOAD_NAME_RE);
  assert.ok(!traversal.includes("..") && !traversal.includes("/"));
  assert.match(safeAssetName("été.mp3", "mp3"), /^[0-9a-f]{12}-ete\.mp3$/);
  assert.match(safeAssetName("con.png", "png"), /^[0-9a-f]{12}-con\.png$/);
});

test("cleans only unreferenced generated uploads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
  fs.writeFileSync(path.join(dir, "aaaaaaaaaaaa-old.gif"), "x");
  fs.writeFileSync(path.join(dir, "bbbbbbbbbbbb-kept.gif"), "x");
  fs.writeFileSync(path.join(dir, "my.gif"), "x");
  const later = Date.now() + 60 * 60 * 1000;
  assert.deepEqual(cleanupUnusedUploads(dir, new Set(["/user-assets/bbbbbbbbbbbb-kept.gif"]), later), [
    "aaaaaaaaaaaa-old.gif",
  ]);
  assert.equal(fs.existsSync(path.join(dir, "my.gif")), true);
});

test("keeps fresh uploads that no pose references yet", () => {
  // The pose using a just-uploaded file may be saved after another save already ran cleanup
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
  fs.writeFileSync(path.join(dir, "cccccccccccc-new.png"), "x");
  assert.deepEqual(cleanupUnusedUploads(dir, new Set()), []);
  assert.deepEqual(cleanupUnusedUploads(dir, new Set(), Date.now() + 11 * 60 * 1000), ["cccccccccccc-new.png"]);
});
