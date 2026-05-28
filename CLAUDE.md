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
```

No test suite exists — manual testing via the `/api/trigger-test` endpoint or the dashboard "Test Alert" button.

## Architecture

Single-process Node app: Express + Socket.IO server (port 3000) bundled with a Vite React SPA.

**Dev mode**: `server/index.ts` runs via `tsx`, Vite runs as middleware (HMR).  
**Production**: `dist/server.cjs` serves pre-built `dist/` as static files.

### Server (`server/`)

| File                   | Role                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `index.ts`             | Entry: wires Express, Socket.IO, rate limiters, CSP, Vite middleware, graceful shutdown                             |
| `routes.ts`            | All REST endpoints (`/api/*`), SSRF-safe media proxy                                                                |
| `discordBotManager.ts` | Discord.js client singleton; routes messages → `mediaWorkerQueue` → `alertManager`                                  |
| `mediaWorkerQueue.ts`  | `p-queue` concurrency=2, cap=50 jobs, 5-min timeout per job                                                         |
| `mediaParser.ts`       | `resolveMediaFromLink()`: yt-dlp → Cobalt API fallback → iframe fallback; caches to `media_cache/` (2 GB, 24 h TTL) |
| `ffmpegNormalizer.ts`  | Post-download ffmpeg normalization to mp4                                                                           |
| `alertManager.ts`      | In-memory queue (cap 100), writes through to SQLite                                                                 |
| `db.ts`                | better-sqlite3 WAL, two tables: `alerts` + `logs` (trimmed to 1000 rows)                                            |
| `settingsManager.ts`   | Loads `settings.json` + `.env`; saves token to `.env`, cookies to `cookies.txt`, rest to `settings.json`            |
| `logManager.ts`        | Bounded in-memory log ring, persisted via `db.ts`                                                                   |
| `bannedWords.ts`       | Word-filter: block or censor mode                                                                                   |
| `env.ts`               | Zod-validated env vars                                                                                              |

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
- Socket.IO CORS locked to `localhost:PORT` only
- `SIZE_LIMITS` in `mediaWorkerQueue.ts` are per-type hard limits (image 10 MB, video 50 MB); `mediaMaxSizeMB` in settings is the user-configurable soft limit for Discord attachments
