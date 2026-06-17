# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (tsx watch + Vite HMR, yt-dlp on PATH)
npm run dev

# Production build (typecheck → vite build → esbuild server bundle)
npm run build

# Run production build
npm start

# Type-check only
npm run typecheck

# Lint
npm lint

# Format
npm run format

# Electron (desktop app)
npm run electron:dev          # build → rebuild better-sqlite3 for Electron ABI → electron .
npm run electron:build        # build + electron-builder (current OS)
npm run electron:build:win    # NSIS installer
npm run electron:build:mac    # DMG (x64 + arm64)
npm run electron:build:linux  # AppImage
npm run electron:rebuild      # rebuild better-sqlite3 against installed Electron only
```

E2E tests via Playwright: `npm test` (headless), `npm run test:ui`. Manual alert testing still via `/api/trigger-test` or the dashboard "Test Alert" button.

## Architecture

Express + Socket.IO server (Vite React SPA) that runs **standalone** (`npm start`) or **inside an Electron shell** (`electron/main.cjs`). Same server bundle either way.

**Dev mode**: `server/index.ts` runs via `tsx`, Vite imported dynamically as middleware (HMR).
**Production**: `dist/server.mjs` (ESM, esbuild `--packages=external`) serves pre-built `dist/` as static files.
**Electron**: `main.cjs` forks `dist/server.mjs` via `utilityProcess` on a free port (3000–3099), waits on `/api/health`, then opens a `BrowserWindow` at `http://127.0.0.1:<port>` + a system tray. First run (no `settings.json`) shows `wizard.html` to capture bot token + channel ID before the dashboard opens.

### Electron shell (`electron/`)

| File          | Role                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.cjs`    | Lifecycle: free-port probe, `utilityProcess` server fork, health wait, main/wizard windows, tray, IPC                                                                         |
| `preload.cjs` | `contextBridge` exposes `electronAPI.completeSetup` / `getPort` (contextIsolation on, nodeIntegration off)                                                                    |
| `wizard.html` | First-run setup UI; `complete-setup` IPC pushes token+channelId through the server's `/api/settings` (reconnects bot), surfaces bad-token errors before opening the dashboard |

**UX goal**: one-click installer → one-click launch → first-run wizard. Main window hides to tray on close (`app.isQuitting` gates real quit); tray "Quit" / `before-quit` kills the forked server.

`server/paths.ts` (`APP_PATHS`): read-only app resources (`dist/`, `package.json`) resolve from `APP_PATH` env (set to `app.getAppPath()` by the fork); writable data (`settings.json`, `.env`, `cookies.txt`, `media_cache/`) lives in the fork's `cwd` = `app.getPath('userData')` when packaged, repo root in dev.

### Server (`server/`)

| File                   | Role                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`             | Entry: wires Express, Socket.IO, rate limiters, CSP, `/api/health`; Vite imported dynamically (dev only); serves `dist/` in prod via `APP_PATHS` |
| `paths.ts`             | `APP_PATHS`: resolves `dist/`+`package.json` from `APP_PATH` env (Electron) or `cwd()` (standalone)                                              |
| `routes.ts`            | All REST endpoints (`/api/*`), SSRF-safe media proxy                                                                                             |
| `discordBotManager.ts` | Discord.js client singleton; routes messages → `mediaWorkerQueue` → `alertManager`                                                               |
| `mediaWorkerQueue.ts`  | `p-queue` concurrency=2, cap=50 jobs, 5-min timeout per job                                                                                      |
| `mediaParser.ts`       | `resolveMediaFromLink()`: yt-dlp → Cobalt API fallback → iframe fallback; caches to `media_cache/` (2 GB, 24 h TTL)                              |
| `ffmpegNormalizer.ts`  | Post-download ffmpeg normalization to mp4                                                                                                        |
| `alertManager.ts`      | In-memory queue (cap 100), writes through to SQLite                                                                                              |
| `db.ts`                | better-sqlite3 WAL, two tables: `alerts` + `logs` (trimmed to 1000 rows)                                                                         |
| `settingsManager.ts`   | Loads `settings.json` + `.env`; saves token to `.env`, cookies to `cookies.txt`, rest to `settings.json`                                         |
| `logManager.ts`        | Bounded in-memory log ring, persisted via `db.ts`                                                                                                |
| `bannedWords.ts`       | Word-filter: block or censor mode                                                                                                                |
| `env.ts`               | Zod-validated env vars                                                                                                                           |

### Frontend (`src/`)

React 19 + Tailwind CSS v4 + Socket.IO client.

| Component           | Route           | Purpose                                                           |
| ------------------- | --------------- | ----------------------------------------------------------------- |
| `StreamerDashboard` | `/` (dashboard) | Config panel: Discord bot, alert settings, queue management, logs |
| `OBSOverlayView`    | `/overlay`      | Full-screen transparent overlay for OBS browser source            |
| `TutorialOverlay`   | —               | First-run onboarding wizard                                       |

`src/types.ts` defines shared types used by both frontend and server (`AlertPayload`, `UIConfig`, `LogEntry`, `BotStatus`).

`src/locales.ts` — i18n strings (fr / en / uwu-fr / uwu-en).

### Data flow

1. Discord message → `discordBotManager` cooldown check → `addJob()` in `mediaWorkerQueue`
2. Job: resolve attachment or URL via `mediaParser.resolveMediaFromLink()`
3. Banned-words filter, NSFW/link checks
4. `alertManager.addAlert()` → SQLite persist → `io.emit("new_alert")`
5. `OBSOverlayView` receives via Socket.IO, plays queue sequentially, emits `alert_played` when done
6. Server removes alert from `alertManager` + DB on `alert_played`

### Key constraints

- `DISCORD_TOKEN` stored in `.env` only, never in `settings.json`
- `cookies.txt` (Netscape format) used by yt-dlp for authenticated YouTube downloads
- `media_cache/` holds downloaded files; `*.tmp` = in-progress download (cleaned on startup)
- Rate limits: write endpoints 300 req/15 min, read/polling 2000 req/15 min
- Socket.IO CORS locked to `localhost:PORT` + `127.0.0.1:PORT` (Electron loads the `127.0.0.1` origin)
- Electron: `complete-setup` IPC verifies `event.sender === wizardWindow.webContents`; token+channelId persist via the server's `/api/settings`, never written behind the fork
- `SIZE_LIMITS` in `mediaWorkerQueue.ts` are per-type hard limits (image 10 MB, video 50 MB); `mediaMaxSizeMB` in settings is the user-configurable soft limit for Discord attachments
