import { AlertPayload } from "../src/types.js";
import { persistAlert, removePersistedAlert, clearPersistedAlerts } from "./db.js";
import { logger } from "./logger.js";

const MAX_ALERT_QUEUE_SIZE = 100;

class AlertManager {
  private queue: AlertPayload[] = [];

  public addAlert(alert: AlertPayload): void {
    if (this.queue.some((a) => a.id === alert.id)) return;

    this.queue.push(alert);
    persistAlert(alert);

    if (this.queue.length > MAX_ALERT_QUEUE_SIZE) {
      const evicted = this.queue.shift();
      if (evicted) removePersistedAlert(evicted.id);
    }
  }

  public getAlerts(): AlertPayload[] {
    return [...this.queue];
  }

  public removeAlert(id: string): void {
    this.queue = this.queue.filter((alert) => alert.id !== id);
    removePersistedAlert(id);
  }

  public reorderQueue(orderedIds: string[]): void {
    const map = new Map(this.queue.map((a) => [a.id, a]));
    const reordered = orderedIds.map((id) => map.get(id)).filter((a): a is AlertPayload => a !== undefined);
    const seen = new Set(orderedIds);
    for (const a of this.queue) {
      if (!seen.has(a.id)) reordered.push(a);
    }
    this.queue = reordered;
  }

  public clearQueue(): void {
    this.queue = [];
    clearPersistedAlerts();
  }

  /** Called once on startup to restore queue from SQLite. */
  public restoreFromDb(alerts: AlertPayload[]): void {
    this.queue = alerts.slice(0, MAX_ALERT_QUEUE_SIZE);
    logger.info({ count: this.queue.length }, "Restored alert(s) from DB");
  }
}

export const alertManager = new AlertManager();
