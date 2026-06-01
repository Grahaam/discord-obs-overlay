import crypto from "crypto";
import type { ServerLogEntry } from "../src/types.js";

const MAX_ENTRIES = 200;

function safeSerialize(obj: unknown): Record<string, unknown> | undefined {
  if (obj === null || typeof obj !== "object") return undefined;
  try {
    return JSON.parse(
      JSON.stringify(obj, (_k, v) => {
        if (v instanceof Error) return { message: v.message, name: v.name };
        return v;
      })
    );
  } catch {
    return { _raw: String(obj) };
  }
}

class ServerLogManager {
  public logs: ServerLogEntry[] = [];
  public onLogAdded: ((log: ServerLogEntry) => void) | null = null;

  public add(level: ServerLogEntry["level"], msg: string, data?: unknown): ServerLogEntry {
    const entry: ServerLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      msg: msg || "[no message]",
      data: safeSerialize(data),
    };
    this.logs.unshift(entry);
    if (this.logs.length > MAX_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_ENTRIES);
    }
    this.onLogAdded?.(entry);
    return entry;
  }

  public getLogs(): ServerLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }
}

export const serverLogManager = new ServerLogManager();
