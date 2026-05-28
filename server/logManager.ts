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
  private logs: LogEntry[] = [];

  public addLog(log: Omit<LogEntry, "id" | "timestamp">) {
    const entry: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.logs.unshift(entry);

    // Prevent memory growth during long-running sessions.
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_LOG_ENTRIES);
    }

    return entry;
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
  }
}

export const logManager = new LogManager();
