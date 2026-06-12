import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { standaloneBinaryName, resolveStandalone } from "./ytDlpBinary.js";

const tmpDirs: string[] = [];
function mkdtemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
test.after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test("standaloneBinaryName maps platforms to standalone asset names", () => {
  assert.equal(standaloneBinaryName("win32"), "yt-dlp.exe");
  assert.equal(standaloneBinaryName("darwin"), "yt-dlp_macos");
  assert.equal(standaloneBinaryName("linux"), "yt-dlp_linux");
});

test("standaloneBinaryName throws on unsupported platform", () => {
  assert.throws(() => standaloneBinaryName("sunos"), /unsupported platform/i);
});

test("resolveStandalone returns null when appPath is undefined (dev)", () => {
  assert.equal(resolveStandalone({ appPath: undefined, cwd: os.tmpdir() }), null);
});

test("resolveStandalone returns null when the bundled binary is absent", () => {
  const appPath = mkdtemp("appp-");
  assert.equal(resolveStandalone({ appPath, cwd: os.tmpdir() }), null);
});

// Build a fake "packaged app" dir with a small stand-in bundled binary. We do
// NOT use the real 36MB binary or exec anything — resolveStandalone copies by
// path only (it never runs the binary), so a small file fully exercises it.
function fakeAppPath(name: string): string {
  const appPath = mkdtemp("appp-");
  const binDir = path.join(appPath, "electron", "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, name), "#!/bin/sh\necho stub\n");
  return appPath;
}

test("resolveStandalone copies the bundled binary to cwd/bin and reports updatable", () => {
  const name = standaloneBinaryName();
  const appPath = fakeAppPath(name);
  const cwd = mkdtemp("cwd-");

  const result = resolveStandalone({ appPath, cwd });

  assert.ok(result, "expected a resolution result");
  assert.equal(result!.updatable, true);
  assert.equal(result!.path, path.join(cwd, "bin", name));
  assert.ok(fs.existsSync(result!.path), "binary should be copied to cwd/bin");
});

test("resolveStandalone trusts an existing target and does not re-copy", () => {
  const name = standaloneBinaryName();
  const appPath = fakeAppPath(name);
  const cwd = mkdtemp("cwd-");
  const target = path.join(cwd, "bin", name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "already here"); // distinct content

  const result = resolveStandalone({ appPath, cwd });

  assert.ok(result, "expected a resolution result");
  assert.equal(result!.updatable, true);
  assert.equal(result!.path, target);
  assert.equal(fs.readFileSync(target, "utf8"), "already here", "existing target must not be overwritten");
});

test("resolveStandalone falls back to bundled (not updatable) when the copy fails", () => {
  const name = standaloneBinaryName();
  const appPath = fakeAppPath(name);
  const cwd = mkdtemp("cwd-");
  // Make cwd/bin a FILE so mkdir/copy throws, forcing the fallback path.
  fs.writeFileSync(path.join(cwd, "bin"), "blocker");

  const result = resolveStandalone({ appPath, cwd });

  assert.ok(result, "expected a resolution result");
  assert.equal(result!.updatable, false, "read-only bundled fallback is not self-updatable");
  assert.equal(result!.path, path.join(appPath, "electron", "bin", name));
});
