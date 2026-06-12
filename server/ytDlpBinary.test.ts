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

test("resolveStandalone copies the bundled binary to cwd/bin and reports updatable", () => {
  // Use the real fetched binary (Task 2) as the bundled source.
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const name = standaloneBinaryName();
  const realBin = path.join(repoRoot, "electron", "bin", name);
  if (!fs.existsSync(realBin)) {
    // Fetch must have run first; fail loudly so the gap is visible.
    throw new Error(`missing ${realBin} — run: node scripts/fetch-ytdlp.cjs`);
  }
  const appPath = mkdtemp("appp-");
  fs.mkdirSync(path.join(appPath, "electron", "bin"), { recursive: true });
  fs.copyFileSync(realBin, path.join(appPath, "electron", "bin", name));
  if (process.platform !== "win32") fs.chmodSync(path.join(appPath, "electron", "bin", name), 0o755);

  const cwd = mkdtemp("cwd-");
  const result = resolveStandalone({ appPath, cwd });

  assert.ok(result, "expected a resolution result");
  assert.equal(result!.updatable, true);
  assert.equal(result!.path, path.join(cwd, "bin", name));
  assert.ok(fs.existsSync(result!.path), "binary should be copied to cwd/bin");
});

test("resolveStandalone removes a non-runnable target and falls back to bundled", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const name = standaloneBinaryName();
  const realBin = path.join(repoRoot, "electron", "bin", name);
  if (!fs.existsSync(realBin)) {
    throw new Error(`missing ${realBin} — run: node scripts/fetch-ytdlp.cjs`);
  }
  const appPath = mkdtemp("appp-");
  fs.mkdirSync(path.join(appPath, "electron", "bin"), { recursive: true });
  const bundled = path.join(appPath, "electron", "bin", name);
  fs.copyFileSync(realBin, bundled);
  if (process.platform !== "win32") fs.chmodSync(bundled, 0o755);

  // Pre-seed a broken (non-runnable) target so the existsSync short-circuit fires.
  const cwd = mkdtemp("cwd-");
  fs.mkdirSync(path.join(cwd, "bin"), { recursive: true });
  const badTarget = path.join(cwd, "bin", name);
  fs.writeFileSync(badTarget, "not a real binary"); // no +x → won't execute

  const result = resolveStandalone({ appPath, cwd });

  assert.ok(result, "expected a resolution result");
  assert.equal(result!.updatable, false, "read-only bundled fallback is not self-updatable");
  assert.equal(result!.path, bundled);
  assert.equal(fs.existsSync(badTarget), false, "broken target should be removed so next launch re-copies");
});
