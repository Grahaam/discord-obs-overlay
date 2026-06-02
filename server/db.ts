import path from "path";
import { createRequire } from "module";
import { AlertPayload } from "../src/types.js";
import type { LogEntry } from "../src/types.js";
import { logger } from "./logger.js";

const _require = createRequire(import.meta.url);
const DB_PATH = path.join(process.cwd(), "overlay.db");
const MAX_LOG_ROWS = 1000;
const LOG_TRIM_INTERVAL = 100;

type DB = import("better-sqlite3").Database;
let db: DB | null = null;
let logInsertCount = 0;

function withDb<T>(fn: (d: any) => T, caller: string): T | undefined {
  if (!db) return undefined;
  try {
    return fn(db);
  } catch (err: any) {
    logger.error({ err: err.message, caller }, "Database operation failed");
    return undefined;
  }
}

export function initDb(): void {
  try {
    const Database = _require("better-sqlite3") as typeof import("better-sqlite3");
    db = new (Database as any)(DB_PATH);
    withDb((d) => {
      d.pragma("journal_mode = WAL");
      d.pragma("synchronous = NORMAL");
      d.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS media_plays (
          filename TEXT PRIMARY KEY,
          play_count INTEGER NOT NULL DEFAULT 0
        );
      `);
    }, "initDb");
    logger.info({ path: DB_PATH }, "SQLite ready");
  } catch (err: any) {
    logger.warn({ err: err.message }, "SQLite unavailable — persistence disabled");
    db = null;
  }
}

export function persistAlert(alert: AlertPayload): void {
  withDb((d) => {
    d.prepare("INSERT OR REPLACE INTO alerts (id, data, created_at) VALUES (?, ?, ?)").run(
      alert.id,
      JSON.stringify(alert),
      alert.timestamp
    );
  }, "persistAlert");
}

export function removePersistedAlert(id: string): void {
  withDb((d) => {
    d.prepare("DELETE FROM alerts WHERE id = ?").run(id);
  }, "removePersistedAlert");
}

export function loadPersistedAlerts(): AlertPayload[] {
  return (
    withDb((d) => {
      const rows = d.prepare("SELECT data FROM alerts ORDER BY created_at ASC").all() as { data: string }[];
      return rows.map((r) => JSON.parse(r.data) as AlertPayload);
    }, "loadPersistedAlerts") ?? []
  );
}

export function clearPersistedAlerts(): void {
  withDb((d) => {
    d.prepare("DELETE FROM alerts").run();
  }, "clearPersistedAlerts");
}

export function persistLog(log: LogEntry): void {
  withDb((d) => {
    d.prepare("INSERT OR REPLACE INTO logs (id, data, created_at) VALUES (?, ?, ?)").run(
      log.id,
      JSON.stringify(log),
      log.timestamp
    );
    if (++logInsertCount % LOG_TRIM_INTERVAL === 0) {
      d.prepare("DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY created_at DESC LIMIT ?)").run(
        MAX_LOG_ROWS
      );
    }
  }, "persistLog");
}

export function loadPersistedLogs(): LogEntry[] {
  return (
    withDb((d) => {
      const rows = d.prepare("SELECT data FROM logs ORDER BY created_at DESC LIMIT ?").all(MAX_LOG_ROWS) as {
        data: string;
      }[];
      return rows.map((r) => JSON.parse(r.data) as LogEntry).reverse();
    }, "loadPersistedLogs") ?? []
  );
}

export function clearPersistedLogs(): void {
  withDb((d) => {
    d.prepare("DELETE FROM logs").run();
  }, "clearPersistedLogs");
}

export function incrementMediaPlayCount(filename: string): void {
  withDb((d) => {
    d.prepare(
      "INSERT INTO media_plays (filename, play_count) VALUES (?, 1) ON CONFLICT(filename) DO UPDATE SET play_count = play_count + 1"
    ).run(filename);
  }, "incrementMediaPlayCount");
}

export function getFrequentMediaFilenames(minPlays: number): Set<string> {
  return (
    withDb((d) => {
      const rows = d.prepare("SELECT filename FROM media_plays WHERE play_count >= ?").all(minPlays) as {
        filename: string;
      }[];
      return new Set(rows.map((r) => r.filename));
    }, "getFrequentMediaFilenames") ?? new Set()
  );
}

export function updateLogInDb(log: LogEntry): void {
  withDb((d) => {
    d.prepare("INSERT OR REPLACE INTO logs (id, data, created_at) VALUES (?, ?, ?)").run(
      log.id,
      JSON.stringify(log),
      log.timestamp
    );
  }, "updateLogInDb");
}
