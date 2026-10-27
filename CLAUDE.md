# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (tsx, no watch: restart after server/ edits; Vite HMR for src/; yt-dlp on PATH)
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
npm run electron:dev          # build → electron . (better-sqlite3 ships N-API prebuilds: no Electron rebuild)
npm run electron:build        # build + electron-builder (current OS)
npm run electron:build:win    # NSIS installer
npm run electron:build:mac    # DMG (x64 + arm64)
npm run electron:build:linux  # AppImage
```

E2E tests via Playwright: `npm test` (headless), `npm run test:ui`. Manual alert testing still via `/api/trigger-test` or the dashboard "Test Alert" button.

## Architecture

Express + Socket.IO server (Vite React SPA) that runs **standalone** (`npm start`) or **inside an Electron shell** (`electron/main.cjs`). Same server bundle either way.

**Dev mode**: `server/index.ts` runs via `tsx` (no watch mode, so restart after editing `server/`), Vite imported dynamically as middleware (HMR).
**Production**: `dist/server.mjs` (ESM, esbuild `--packages=external`) serves pre-built `dist/` as static files.
**Electron**: `main.cjs` forks `dist/server.mjs` via `utilityProcess` on a free port (3000–3099), waits on `/api/health`, then opens a `BrowserWindow` at `http://127.0.0.1:<port>` + a system tray. First run (no `settings.json`, or one without a `channelId`) shows the 3-step `wizard.html` (create bot, paste token + invite, pick channel from `GET /api/discord/channels`) before the dashboard opens.

### Electron shell (`electron/`)

| File          | Role                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.cjs`    | Lifecycle: free-port probe, `utilityProcess` server fork, health wait, main/wizard windows, tray, IPC                                                                                          |
| `preload-wizard.cjs` / `preload-main.cjs` | Sandboxed preloads (`sandbox: true`, contextIsolation on): wizard exposes `setupToken` / `listChannels` / `setupChannel` / `openExternal`; dashboard exposes `getPort` / `openUserAssets`. `main.cjs` also locks navigation to the local origin and allows only the camera (`media`) for it |
| `wizard.html` + `wizard.js` | First-run setup UI; `setup-token` / `setup-channel` IPC push token then channelId through the server's `/api/settings` (reconnects bot), surface bad-token errors before opening the dashboard |

**UX goal**: one-click installer → one-click launch → first-run wizard. Main window hides to tray on close (`app.isQuitting` gates real quit); tray "Quit" asks the server to shut down over `parentPort` (restores OBS, closes DB), hard kill after 5 s.

`server/paths.ts`: `APP_PATHS` = read-only shipped files (`dist/`, `package.json`, MediaPipe wasm, `models/` pose model) rooted at `APP_PATH` (`app.getAppPath()`); `DATA_PATHS` = writable files (`settings.json`, `.env`, `cookies.txt`, `overlay.db`, `media_cache/`, `bin/`, `user-assets/`) rooted at `DATA_DIR` (`app.getPath("userData")`). Both fall back to the repo folder in dev. Never use `process.cwd()` directly.

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
| `approvalPolicy.ts`    | Pure rule: does this poster's alert wait for approval (mode, trusted roles, N approved alerts, "always approve")                                 |
| `approvalManager.ts`   | `submit()` delivers or holds alerts (`pending_approvals` + `poster_trust` tables), approve/reject/expiry, Socket.IO `approval_*` events         |
| `db.ts`                | better-sqlite3 WAL, two tables: `alerts` + `logs` (trimmed to 1000 rows)                                                                         |
| `settingsManager.ts`   | Loads `settings.json` + `.env`; saves token to `.env`, cookies to `cookies.txt`, rest to `settings.json`                                         |
| `logManager.ts`        | Bounded in-memory log ring, persisted via `db.ts`                                                                                                |
| `bannedWords.ts`       | Word-filter: block or censor mode                                                                                                                |
| `env.ts`               | Zod-validated env vars                                                                                                                           |

### Frontend (`src/`)

React 19 + Tailwind CSS v4 + Socket.IO client.

| Component           | Route           | Purpose                                                                                                                         |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `StreamerDashboard` | `/` (dashboard) | Config panel: Discord bot, alert settings, queue management, logs                                                               |
| `OBSOverlayView`    | `/overlay`      | Full-screen transparent overlay for OBS browser source                                                                          |
| `TutorialOverlay`   | —               | First-run onboarding wizard                                                                                                     |
| `SetupChecklist`    | —               | Live setup checklist (bot, overlay, OBS, test alert, optional cookies), polls `GET /api/setup-status` (`server/setupStatus.ts`) |

`src/types.ts` defines shared types used by both frontend and server (`AlertPayload`, `UIConfig`, `LogEntry`, `BotStatus`).

`src/locales.ts` — i18n strings (fr / en / uwu-fr / uwu-en).

### Data flow

1. Discord message → `discordBotManager` cooldown check → `addJob()` in `mediaWorkerQueue`
2. Job: resolve attachment or URL via `mediaParser.resolveMediaFromLink()`
3. Banned-words filter, NSFW/link checks
4. `approvalManager.submit()`: trusted poster → `alertManager.addAlert()` → SQLite persist → `io.emit("new_alert")`; otherwise held in the Live inbox until approved
5. `OBSOverlayView` receives via Socket.IO, plays queue sequentially, emits `alert_played` when done
6. Server removes alert from `alertManager` + DB on `alert_played`

### Key constraints

- `DISCORD_TOKEN` stored in `.env` only, never in `settings.json`
- `cookies.txt` (Netscape format; setting key `youtubeCookiesContent` for historic reasons) is used by yt-dlp for Instagram / TikTok / Reddit only; YouTube downloads never use cookies
- `media_cache/` holds downloaded files; `*.tmp` = in-progress download (cleaned on startup)
- Rate limits: write endpoints 300 req/15 min, read/polling 5000 req/15 min
- Host-header check (`index.ts`): requests whose `Host` isn't `127.0.0.1:PORT` / `localhost:PORT` get a 403 (DNS-rebinding guard)
- Socket.IO CORS locked to `localhost:PORT` + `127.0.0.1:PORT` (Electron loads the `127.0.0.1` origin)
- Electron: the wizard IPC handlers (`setup-token`, `list-channels`, `setup-channel`, `open-external`) verify `event.sender === wizardWindow.webContents`; token+channelId persist via the server's `/api/settings`, never written behind the fork
- `SIZE_LIMITS` in `mediaWorkerQueue.ts` are per-type hard limits (image 10 MB, video 50 MB); `mediaMaxSizeMB` in settings is the user-configurable soft limit for Discord attachments
