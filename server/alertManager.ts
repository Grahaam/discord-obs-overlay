import { AlertPayload } from "../src/types";

const MAX_ALERT_QUEUE_SIZE = 100;

class AlertManager {
  private queue: AlertPayload[] = [];

  public addAlert(alert: AlertPayload): void {
    this.queue.push(alert);

    // Prevent unbounded memory growth during long streams.
    if (this.queue.length > MAX_ALERT_QUEUE_SIZE) {
      this.queue.shift();
    }
  }

  public getAlerts(): AlertPayload[] {
    return [...this.queue];
  }

  public removeAlert(id: string): void {
    this.queue = this.queue.filter((alert) => alert.id !== id);
  }

  public clearQueue(): void {
    this.queue = [];
  }
}

export const alertManager = new AlertManager();
