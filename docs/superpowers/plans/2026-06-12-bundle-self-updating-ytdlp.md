# Bundle Self-Updating Standalone yt-dlp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the PyInstaller standalone yt-dlp inside the installer (no user Python), copy it to a writable dir on launch, and self-update it via `yt-dlp -U`.

**Architecture:** A build-time `.cjs` script downloads the platform standalone binary into `electron/bin/` (already bundled by the existing `electron/**` packaging glob). At runtime a focused module `server/ytDlpBinary.ts` detects the packaged app via `APP_PATH`, copies the read-only bundled binary into the writable `userData/bin/`, and reports whether the active binary is self-updatable. `server/mediaParser.ts` prefers that binary when packaged and only runs `-U` when it is the self-updatable standalone.

**Tech Stack:** Node 22 (`fetch`, `node:crypto`, `node:test`), tsx, esbuild, electron-builder, youtube-dl-exec.

---

## File Structure

- **Create** `scripts/fetch-ytdlp.cjs` — build-time downloader + SHA-256 verifier. Exports pure helpers (`assetNameForPlatform`, `parseSha256Sums`) and runs as a CLI when invoked directly.
- **Create** `scripts/fetch-ytdlp.test.cjs` — unit tests for the pure helpers.
- **Create** `server/ytDlpBinary.ts` — runtime resolution of the standalone binary (`standaloneBinaryName`, `resolveStandalone`). Dependency-injectable for tests.
- **Create** `server/ytDlpBinary.test.ts` — unit + integration tests for resolution.
- **Modify** `server/mediaParser.ts` — use `ytDlpBinary` in `findBestYtDlpPath()`, track `_ytDlpIsStandalone`, gate `updateYtDlp()`.
- **Modify** `package.json` — wire `fetch-ytdlp.cjs` into `electron:build*` scripts; add `test:unit` script.
- **Modify** `.gitignore` — ignore the downloaded `electron/bin/` binaries.

**Note on packaging:** `build.files` already contains `electron/**`, which globs `electron/bin/**`, so no `build.files` change is needed — only the binary must exist on disk before `electron-builder` runs.

---

## Task 1: Build-time downloader pure helpers (TDD)

**Files:**
- Create: `scripts/fetch-ytdlp.cjs`
- Test: `scripts/fetch-ytdlp.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/fetch-ytdlp.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const { assetNameForPlatform, parseSha256Sums } = require("./fetch-ytdlp.cjs");

test("assetNameForPlatform maps each platform to the standalone asset", () => {
  assert.equal(assetNameForPlatform("win32"), "yt-dlp.exe");
  assert.equal(assetNameForPlatform("darwin"), "yt-dlp_macos");
  assert.equal(assetNameForPlatform("linux"), "yt-dlp_linux");
});

test("assetNameForPlatform throws on unsupported platform", () => {
  assert.throws(() => assetNameForPlatform("aix"), /unsupported platform/i);
});

test("parseSha256Sums returns the hash for a given asset", () => {
  const sums = [
    "abc123  yt-dlp.exe",
    "def456  yt-dlp_macos",
    "789aaa  yt-dlp_linux",
  ].join("\n");
  assert.equal(parseSha256Sums(sums, "yt-dlp_macos"), "def456");
});

test("parseSha256Sums returns null when the asset is absent", () => {
  assert.equal(parseSha256Sums("abc  other", "yt-dlp.exe"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/fetch-ytdlp.test.cjs`
Expected: FAIL — `Cannot find module './fetch-ytdlp.cjs'` (file not created yet).

- [ ] **Step 3: Write minimal implementation (helpers only)**

```js
// scripts/fetch-ytdlp.cjs
"use strict";

const ASSET_BY_PLATFORM = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

function assetNameForPlatform(platform) {
  const name = ASSET_BY_PLATFORM[platform];
  if (!name) throw new Error(`unsupported platform: ${platform}`);
  return name;
}

function parseSha256Sums(text, assetName) {
  for (const line of text.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === assetName) return hash;
  }
  return null;
}

module.exports = { assetNameForPlatform, parseSha256Sums };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/fetch-ytdlp.test.cjs`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-ytdlp.cjs scripts/fetch-ytdlp.test.cjs
git commit -m "feat(build): yt-dlp downloader pure helpers"
```

---

## Task 2: Build-time downloader CLI (download + verify + idempotent)

**Files:**
- Modify: `scripts/fetch-ytdlp.cjs`

- [ ] **Step 1: Add the download CLI below the helpers**

Append to `scripts/fetch-ytdlp.cjs`, before `module.exports`:

```js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Pinned for reproducible builds; bump to adopt a newer baseline. Runtime
// `yt-dlp -U` keeps end users current regardless of this value.
const YTDLP_VERSION = "2026.06.09";
const BIN_DIR = path.join(__dirname, "..", "electron", "bin");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function platformFromArgs() {
  const i = process.argv.indexOf("--platform");
  return i !== -1 ? process.argv[i + 1] : process.platform;
}

async function download(url) {
  const res = await fetch(url); // global fetch follows redirects
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const platform = platformFromArgs();
  const asset = assetNameForPlatform(platform);
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;
  const target = path.join(BIN_DIR, asset);

  const sums = (await download(`${base}/SHA2-256SUMS`)).toString("utf8");
  const expected = parseSha256Sums(sums, asset);
  if (!expected) throw new Error(`no checksum for ${asset} in SHA2-256SUMS`);

  if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === expected) {
    console.log(`[fetch-ytdlp] ${asset} already present and verified`);
    return;
  }

  console.log(`[fetch-ytdlp] downloading ${asset} (${YTDLP_VERSION})`);
  const bin = await download(`${base}/${asset}`);
  const actual = sha256(bin);
  if (actual !== expected) {
    throw new Error(`checksum mismatch for ${asset}: ${actual} != ${expected}`);
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.writeFileSync(target, bin);
  if (platform !== "win32") fs.chmodSync(target, 0o755);
  console.log(`[fetch-ytdlp] wrote ${target}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[fetch-ytdlp] ${err.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run the downloader for the current platform**

Run: `node scripts/fetch-ytdlp.cjs`
Expected: prints `downloading yt-dlp_<platform>` then `wrote .../electron/bin/yt-dlp_<platform>` (or `already present and verified` on re-run).

- [ ] **Step 3: Verify the binary runs and self-reports a version**

Run (macOS/Linux): `./electron/bin/yt-dlp_macos --version` (or `yt-dlp_linux`)
Run (Windows): `electron\bin\yt-dlp.exe --version`
Expected: prints a version like `2026.06.09`.

- [ ] **Step 4: Verify idempotency**

Run: `node scripts/fetch-ytdlp.cjs`
Expected: prints `already present and verified` (no re-download).

- [ ] **Step 5: Verify unit tests still pass**

Run: `node --test scripts/fetch-ytdlp.test.cjs`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-ytdlp.cjs
git commit -m "feat(build): download + verify standalone yt-dlp binary"
```

---

## Task 3: Ignore downloaded binaries in git

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append the ignore rule**

Add to the end of `.gitignore`:

```gitignore
# Standalone yt-dlp binaries fetched at build time (scripts/fetch-ytdlp.cjs)
/electron/bin/
```

- [ ] **Step 2: Verify the binary is no longer tracked/untracked-noise**

Run: `git status --porcelain electron/bin`
Expected: no output (directory ignored).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore fetched yt-dlp binaries"
```

---

## Task 4: Runtime resolution module — `standaloneBinaryName` (TDD)

**Files:**
- Create: `server/ytDlpBinary.ts`
- Test: `server/ytDlpBinary.test.ts`
- Modify: `package.json` (add `test:unit` script)

- [ ] **Step 1: Add the `test:unit` npm script**

In `package.json` `scripts`, add:

```json
"test:unit": "node --import tsx --test \"server/**/*.test.ts\"",
```

- [ ] **Step 2: Write the failing test**

```ts
// server/ytDlpBinary.test.ts
import test from "node:test";
import assert from "node:assert";
import { standaloneBinaryName } from "./ytDlpBinary.js";

test("standaloneBinaryName maps platforms to standalone asset names", () => {
  assert.equal(standaloneBinaryName("win32"), "yt-dlp.exe");
  assert.equal(standaloneBinaryName("darwin"), "yt-dlp_macos");
  assert.equal(standaloneBinaryName("linux"), "yt-dlp_linux");
});

test("standaloneBinaryName throws on unsupported platform", () => {
  assert.throws(() => standaloneBinaryName("sunos"), /unsupported platform/i);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test server/ytDlpBinary.test.ts`
Expected: FAIL — cannot find module `./ytDlpBinary.js`.

- [ ] **Step 4: Write minimal implementation**

```ts
// server/ytDlpBinary.ts
const ASSET_BY_PLATFORM: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

export function standaloneBinaryName(platform: NodeJS.Platform = process.platform): string {
  const name = ASSET_BY_PLATFORM[platform];
  if (!name) throw new Error(`unsupported platform: ${platform}`);
  return name;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test server/ytDlpBinary.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add server/ytDlpBinary.ts server/ytDlpBinary.test.ts package.json
git commit -m "feat(media): standalone yt-dlp binary name resolver"
```

---

## Task 5: Runtime resolution module — `resolveStandalone` (TDD)

**Files:**
- Modify: `server/ytDlpBinary.ts`
- Test: `server/ytDlpBinary.test.ts`

Depends on Task 2 having produced `electron/bin/<binary>` for the current platform (the integration test copies that real binary).

- [ ] **Step 1: Write the failing tests**

Append to `server/ytDlpBinary.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveStandalone } from "./ytDlpBinary.js";

test("resolveStandalone returns null when appPath is undefined (dev)", () => {
  assert.equal(resolveStandalone({ appPath: undefined, cwd: os.tmpdir() }), null);
});

test("resolveStandalone returns null when the bundled binary is absent", () => {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), "appp-"));
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
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), "appp-"));
  fs.mkdirSync(path.join(appPath, "electron", "bin"), { recursive: true });
  fs.copyFileSync(realBin, path.join(appPath, "electron", "bin", name));
  if (process.platform !== "win32") fs.chmodSync(path.join(appPath, "electron", "bin", name), 0o755);

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cwd-"));
  const result = resolveStandalone({ appPath, cwd });

  assert.ok(result, "expected a resolution result");
  assert.equal(result!.updatable, true);
  assert.equal(result!.path, path.join(cwd, "bin", name));
  assert.ok(fs.existsSync(result!.path), "binary should be copied to cwd/bin");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test server/ytDlpBinary.test.ts`
Expected: FAIL — `resolveStandalone` is not exported.

- [ ] **Step 3: Implement `resolveStandalone`**

Append to `server/ytDlpBinary.ts`:

```ts
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

export interface StandaloneResult {
  path: string;
  updatable: boolean;
}

interface ResolveOpts {
  appPath?: string;
  cwd?: string;
  platform?: NodeJS.Platform;
}

function runsOk(bin: string): boolean {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the bundled standalone yt-dlp. Only meaningful when packaged
 * (appPath set by the Electron fork). Copies the read-only bundled binary
 * into a writable dir (cwd/bin) so `yt-dlp -U` can replace it in place;
 * falls back to running the read-only bundled copy (not self-updatable) if
 * the copy fails.
 */
export function resolveStandalone(opts: ResolveOpts = {}): StandaloneResult | null {
  const appPath = opts.appPath ?? process.env.APP_PATH;
  if (!appPath) return null;
  const cwd = opts.cwd ?? process.cwd();
  const platform = opts.platform ?? process.platform;
  const name = standaloneBinaryName(platform);

  const bundled = path.join(appPath, "electron", "bin", name);
  if (!fs.existsSync(bundled)) return null;

  const target = path.join(cwd, "bin", name);
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(bundled, target);
      if (platform !== "win32") fs.chmodSync(target, 0o755);
    }
    if (runsOk(target)) return { path: target, updatable: true };
  } catch {
    /* copy/exec failed — fall through to read-only bundled */
  }
  if (runsOk(bundled)) return { path: bundled, updatable: false };
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test server/ytDlpBinary.test.ts`
Expected: PASS — 5 tests (2 from Task 4 + 3 new: undefined-appPath, absent-bundled, copy-updatable).

- [ ] **Step 5: Commit**

```bash
git add server/ytDlpBinary.ts server/ytDlpBinary.test.ts
git commit -m "feat(media): resolve + copy standalone yt-dlp to writable dir"
```

---

## Task 6: Wire resolution into `mediaParser.ts`

**Files:**
- Modify: `server/mediaParser.ts` (imports near line 1-33; `findBestYtDlpPath` ~54-82; `updateYtDlp` ~538-552)

- [ ] **Step 1: Import the resolver**

Add after the existing `import { settingsManager } from "./settingsManager.js";` line:

```ts
import { resolveStandalone } from "./ytDlpBinary.js";
```

- [ ] **Step 2: Add the standalone branch + tracking flag**

Replace the current resolver block:

```ts
function findBestYtDlpPath(): string | null {
  const isWin = process.platform === "win32";
  const venvBin = path.join(process.cwd(), ".venv", isWin ? "Scripts" : "bin", isWin ? "yt-dlp.exe" : "yt-dlp");
```

with:

```ts
// Set by findBestYtDlpPath(): true only when the active binary is the bundled
// standalone copy in a writable dir, which is the only variant that supports
// `yt-dlp -U` self-update. venv (pip) / system (brew/apt) installs do not.
let _ytDlpIsStandalone = false;

function findBestYtDlpPath(): string | null {
  // Packaged: prefer the bundled, self-updating standalone binary.
  const standalone = resolveStandalone();
  if (standalone) {
    _ytDlpIsStandalone = standalone.updatable;
    logger.info({ ytDlp: standalone.path, updatable: standalone.updatable }, "Using bundled standalone yt-dlp");
    return standalone.path;
  }

  const isWin = process.platform === "win32";
  const venvBin = path.join(process.cwd(), ".venv", isWin ? "Scripts" : "bin", isWin ? "yt-dlp.exe" : "yt-dlp");
```

(The remainder of `findBestYtDlpPath` — the venv and system branches and the final `return null` — is unchanged.)

- [ ] **Step 3: Gate `updateYtDlp` on the standalone flag**

Replace the body guard in `updateYtDlp`:

```ts
  if (_ytDlpCustomPath) {
    logger.info({ ytDlp: _ytDlpCustomPath }, "External yt-dlp (venv/system) — skipping self-update");
    return;
  }
```

with:

```ts
  // Self-update only works on the bundled standalone (writable copy) or the
  // youtube-dl-exec fallback. venv (pip) / system (brew/apt) binaries refuse
  // `yt-dlp -U` with exit code 100 — skip them.
  if (_ytDlpCustomPath && !_ytDlpIsStandalone) {
    logger.info({ ytDlp: _ytDlpCustomPath }, "External yt-dlp (venv/system) — skipping self-update");
    return;
  }
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no output (exit 0).

- [ ] **Step 5: Verify lint passes (prettier auto-runs in CI; check eslint logic)**

Run: `npx eslint server/mediaParser.ts server/ytDlpBinary.ts --rule '{"prettier/prettier":"off"}'`
Expected: no output (exit 0).

- [ ] **Step 6: Verify unit tests still pass**

Run: `npm run test:unit`
Expected: PASS — all `server/**/*.test.ts` tests.

- [ ] **Step 7: Commit**

```bash
git add server/mediaParser.ts
git commit -m "feat(media): prefer + self-update bundled standalone yt-dlp"
```

---

## Task 7: Wire the build-time fetch into electron-builder scripts

**Files:**
- Modify: `package.json` (`scripts`)

- [ ] **Step 1: Prepend the fetch to each electron build script**

Change these `scripts` entries so the binary is fetched for the right target before `electron-builder` runs:

```json
"electron:build": "npm run build && node scripts/fetch-ytdlp.cjs && electron-builder",
"electron:build:win": "npm run build && node scripts/fetch-ytdlp.cjs --platform win32 && electron-builder --win",
"electron:build:mac": "npm run build && node scripts/fetch-ytdlp.cjs --platform darwin && electron-builder --mac",
"electron:build:linux": "npm run build && node scripts/fetch-ytdlp.cjs --platform linux && electron-builder --linux",
```

- [ ] **Step 2: Verify the plain build script fetches for the host platform**

Run: `npm run build && node scripts/fetch-ytdlp.cjs`
Expected: build succeeds; `electron/bin/yt-dlp_<host>` present and verified.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build(electron): fetch standalone yt-dlp before packaging"
```

---

## Task 8: Manual end-to-end verification (packaged, Python-free)

**Files:** none (verification only).

- [ ] **Step 1: Build the desktop app for the host platform**

Run (macOS): `npm run electron:build:mac`
Expected: `dist-electron/` contains the dmg; build logs show `[fetch-ytdlp] wrote .../electron/bin/yt-dlp_macos`.

- [ ] **Step 2: Confirm the binary is inside the package**

Run (macOS): `ls "dist-electron/mac-arm64/LiveChat.app/Contents/Resources/app/electron/bin/"`
Expected: `yt-dlp_macos` present.

- [ ] **Step 3: Launch the packaged app and resolve a YouTube link**

Install/launch the built app. Complete the wizard if needed. Trigger a test alert with a YouTube URL (dashboard "Test Alert" or a Discord message).
Expected: media resolves and plays; server logs show `Using bundled standalone yt-dlp` with `updatable: true`.

- [ ] **Step 4: Confirm the writable copy + self-update ran**

Check the app's `userData` dir (macOS: `~/Library/Application Support/LiveChat/bin/`).
Expected: `yt-dlp_macos` exists; logs show `yt-dlp checking for updates` then `yt-dlp update check completed` (or a WARN if offline — acceptable).

- [ ] **Step 5: Confirm no Python dependency**

In a shell with Python hidden (e.g. temporarily rename `python3` on PATH) or on a machine without Python, repeat Step 3.
Expected: resolution still works — the standalone embeds its own interpreter.

- [ ] **Step 6: Final commit (docs/checklist only, if any notes were added)**

No code change expected. If verification surfaced a fix, capture it as its own task/commit.

---

## Notes for the implementer

- **Why a separate `ytDlpBinary.ts`:** importing `mediaParser.ts` triggers heavy top-level side effects (metascraper init, dir creation, binary probing). The resolver is extracted so it can be unit-tested in isolation with injected `appPath`/`cwd`.
- **ESM import paths:** server code is ESM compiled by esbuild; intra-server imports use the `.js` extension (e.g. `./ytDlpBinary.js`) even though the source is `.ts`. Follow the existing convention in `mediaParser.ts`.
- **Windows `-U` timing:** on Windows the self-update completes via an exit handler, so a freshly updated yt-dlp takes effect on the *next* launch. This is expected and fine for the non-blocking startup update.
- **CI:** the existing `.github/workflows` build job does not run `electron:build*`, so it will not fetch the binary — no CI change needed. The fetch runs only during local/release packaging.
