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

export class LogManager {
  public logs: LogEntry[] = [];

  public addLog(log: Omit<LogEntry, "id" | "timestamp">) {
    const entry: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    this.logs.unshift(entry);
    if (this.logs.length > 100) this.logs.pop();
  }

  public clearLogs() {
    this.logs = [];
  }
}

export const logManager = new LogManager();
