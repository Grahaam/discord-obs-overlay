# Bundle a self-updating standalone yt-dlp

**Date:** 2026-06-12
**Status:** Approved (design)
**Branch:** feat/electron-wrap

## Problem

The packaged desktop app has no reliable yt-dlp:

- The binary `youtube-dl-exec` bundles is the **Python zipapp** (`#!/usr/bin/env python3`, ~3 MB). It requires Python 3.9+ on the end user's machine. A one-click installer cannot assume Python is present.
- The runtime resolver (`findBestYtDlpPath()` in `server/mediaParser.ts`) prefers `.venv` → system (`which`) → bundled zipapp. On an end-user machine there is no `.venv` (the `postinstall` setup script only runs at dev/build time) and usually no system yt-dlp, so it falls back to the zipapp and silently depends on Python.
- Neither a pip (`.venv`) nor a Homebrew/apt system binary can self-update: `yt-dlp -U` exits with code 100 ("installed with a package manager — use that to update"). yt-dlp breaks against YouTube roughly monthly, so a binary that cannot update goes stale fast. This produced the observed `ERROR: ... Requested format is not available` failures on a 3-month-old binary.

## Goal

Ship a self-contained, self-updating yt-dlp inside the installer so the end user needs **no Python, no Homebrew, no venv**, and the binary stays current between app releases.

## Key facts (verified)

- The **PyInstaller standalone** builds — `darwin_exe` (`yt-dlp_macos`, a universal2 binary covering x64 + arm64), `win_exe` (`yt-dlp.exe`), `linux_exe` (`yt-dlp_linux`) — embed their own Python interpreter. No system Python required. ~30 MB each.
- Only these standalone variants support `yt-dlp -U`. Source, package-manager, and onedir installs are non-updateable.
- `-U` replaces the binary in place: it writes `<bin>.new`, renames the current to `<bin>.old`, promotes the new file. It therefore needs **write access to the binary's own directory**, and pre-checks that access (failing early, not mid-update). On Windows the swap completes via an exit handler, so the new version is active on the **next** launch.
- ffmpeg is already solved: the app uses `ffmpeg-static`, a self-contained binary. No change needed.
- `electron-builder` config already has `asar: false`, so bundled files are loose on disk and directly executable — no `asarUnpack` needed.

## Approach (chosen: A — bundle + runtime self-update)

Bundle the standalone binary at build time. On launch, copy it once into the app's writable data directory and run a non-blocking `yt-dlp -U` so it self-updates between app releases.

Rejected alternatives:

- **B — bundle read-only, refresh per app release.** Simpler (no writable-copy step) but yt-dlp goes stale between releases — the exact failure we are fixing.
- **C — download on first run.** Smaller installer but requires internet on first launch and a download-failure fallback. User chose build-time bundling.

App auto-update (electron-updater) is explicitly **out of scope** — the existing GitHub-release notification banner stays.

## Components

### 1. Build-time fetch — `scripts/fetch-ytdlp.cjs`

- Downloads the standalone binary for the target platform(s) into `electron/bin/`:
  - Windows → `yt-dlp.exe`
  - macOS → `yt-dlp_macos` (universal2; one file serves x64 + arm64)
  - Linux → `yt-dlp_linux`
- Verifies each download against the release `SHA2-256SUMS` file.
- Idempotent: skips the download when the file already exists and its hash matches.
- Sets the executable bit on the macOS/Linux binaries.
- Pins a known-good yt-dlp version (constant in the script) so builds are reproducible; bumping is a one-line change. Runtime `-U` keeps users current regardless.
- A failed or hash-mismatched download exits non-zero, failing the build. Never ship a missing/corrupt binary.
- Wired into the `electron:build`, `electron:build:win`, `electron:build:mac`, and `electron:build:linux` npm scripts, before `electron-builder`.

### 2. Packaging — `electron-builder` (package.json `build`)

- Add `electron/bin/**` to `build.files`. With `asar: false` the binary lands loose under the app's resources and stays executable.

### 3. Runtime resolution — `server/mediaParser.ts`

- New helper `ensureStandaloneYtDlp()`:
  - Resolves the bundled (read-only) binary path from the app resources, using the `APP_PATH` env var the Electron fork already sets (see `server/paths.ts`): `<APP_PATH>/electron/bin/<platformBinary>`.
  - Resolves the writable target: `<cwd>/bin/<platformBinary>`. When packaged, `process.cwd()` is `app.getPath('userData')` (per the existing paths contract); in dev it is the repo root.
  - If the target is missing, copies the bundled binary to it and `chmod +x`. Returns the target path.
- `findBestYtDlpPath()` ordering:
  - **Packaged** (`APP_PATH` set): prefer the standalone copy from `ensureStandaloneYtDlp()`; fall back to the existing `.venv` → system chain if the copy fails.
  - **Dev** (no `APP_PATH`): unchanged — `.venv` → system → `youtube-dl-exec` zipapp. Use the standalone only if one is already present. Developers keep their Python workflow.
- Track whether the active binary is the self-updatable standalone in a module flag `_ytDlpIsStandalone`.

### 4. Self-update — `updateYtDlp()` in `server/mediaParser.ts`

- If `_ytDlpIsStandalone` is true → run the existing non-blocking `-U` on startup. It works because the standalone supports `-U` and the copy lives in a writable directory.
- Otherwise (venv/system, or the read-only resources fallback) → skip, as the current code-100 guard already does.

## Data flow (packaged launch)

1. Server fork starts (`dist/server.mjs`), `APP_PATH` set, `cwd` = userData.
2. Resolution: `ensureStandaloneYtDlp()` copies the bundled binary → `userData/bin/<bin>` if absent; active path = that copy; `_ytDlpIsStandalone = true`.
3. `updateYtDlp()` fires `yt-dlp -U` (non-blocking). Fresh version applies this run (Unix) or next launch (Windows).
4. Media jobs invoke the active path.
5. Offline launch: `-U` fails, is caught and warned, the existing copy is used.

## Error handling

| Failure | Behavior |
| --- | --- |
| Build-time download/hash failure | Exit non-zero, fail the build (loud). |
| Runtime copy to userData fails | Fall back to the read-only bundled resources path; still usable; `_ytDlpIsStandalone = false` so `-U` is skipped. |
| `-U` fails (offline, network) | Caught and logged as WARN; existing binary used (current behavior). |
| No bundled binary at all (dev, fetch not run) | Existing `.venv` → system → zipapp chain. |

## Testing

- **Unit:** path resolution for packaged vs dev — mock `fs` and the `APP_PATH` env; assert the standalone copy is preferred when packaged and the existing chain when not; assert `_ytDlpIsStandalone` gates `-U`.
- **Manual:** build the macOS dmg, launch on a machine without Python (or with `python3` removed from PATH), resolve a YouTube link, confirm `userData/bin/yt-dlp_macos` is created, the link resolves, and `-U` runs (check logs).

## Out of scope (YAGNI)

- ffmpeg changes — already self-contained via `ffmpeg-static`.
- App auto-update (electron-updater) — notification banner stays.
- yt-dlp version-pinning UI / release-channel selection.

## Sources

- yt-dlp self-update mechanism — https://deepwiki.com/yt-dlp/yt-dlp/6.4-self-update-mechanism
- yt-dlp installation (variants, updateability) — https://github.com/yt-dlp/yt-dlp/wiki/Installation
- Bundling native binaries in Electron (asarUnpack) — https://blog.benjamin-mathieu.ch/blog/build-your-first-electron-app
