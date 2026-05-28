// MediaType is the canonical union — never add "react-player" here again.
export type MediaType = "image" | "video" | "iframe" | "link";

export interface LogEntry {
  id: string;
  timestamp: number;
  author: string;
  text: string;
  type: MediaType;
  mediaUrl: string;
  status: "approved" | "blocked" | "censored" | "error";
  reason: string;
}

const MAX_LOG_ENTRIES = 500;

export class LogManager {
  public logs: LogEntry[] = [];

  public addLog(log: Omit<LogEntry, "id" | "timestamp">) {
    const entry: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.logs.unshift(entry);

    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_LOG_ENTRIES);
    }

    // Persist to DB without blocking — import lazily to avoid circular deps at startup
    import("./db.js").then(({ persistLog }) => persistLog(entry)).catch(() => {});

    return entry;
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    import("./db.js").then(({ clearPersistedLogs }) => clearPersistedLogs()).catch(() => {});
  }

  /** Called once on startup to restore recent logs from SQLite. */
  public restoreFromDb(logs: LogEntry[]): void {
    this.logs = logs.slice(0, MAX_LOG_ENTRIES);
    console.log(`[LogManager] Restored ${this.logs.length} log(s) from DB`);
  }
}

export const logManager = new LogManager();
