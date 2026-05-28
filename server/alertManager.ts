import { AlertPayload } from "../src/types";

class AlertManager {
  private queue: AlertPayload[] = [];

  public addAlert(alert: AlertPayload): void {
    this.queue.push(alert);
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
