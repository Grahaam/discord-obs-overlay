import type { Server } from "socket.io";
import type { AlertPayload, LogEntry, PendingApproval } from "../src/types.js";
import { decideApproval, type PosterTrust } from "./approvalPolicy.js";
import { alertManager } from "./alertManager.js";
import {
  loadPendingApprovals,
  loadPosterTrust,
  persistPendingApproval,
  persistPosterTrust,
  removePendingApproval,
} from "./db.js";
import { logManager } from "./logManager.js";
import { logger } from "./logger.js";
import { settingsManager } from "./settingsManager.js";

const SWEEP_INTERVAL_MS = 30_000;
const MAX_PENDING = 100;

export type ApprovalOutcome = "approved" | "rejected" | "expired";

export interface Poster {
  id: string;
  roleIds: string[];
  channelId?: string;
  messageId?: string;
}

type LogBase = Omit<LogEntry, "id" | "timestamp" | "status" | "reason">;

const logBaseOf = (alert: AlertPayload): LogBase => ({
  author: alert.authorName,
  authorAvatar: alert.authorAvatar,
  text: alert.text,
  title: alert.title,
  thumbnailUrl: alert.thumbnailUrl,
  type: alert.type,
  mediaUrl: alert.mediaUrl,
});

/**
 * Holds alerts from untrusted posters until the streamer approves them. Every alert that would go on air
 * goes through `submit`, which either delivers it right away or parks it here (persisted in SQLite).
 */
class ApprovalManager {
  private pending = new Map<string, PendingApproval>();
  private trust = new Map<string, PosterTrust>();
  private io: Server | null = null;
  private timer: NodeJS.Timeout | null = null;

  /** Overlay paused: delivered alerts are queued but not pushed. Set by the bot manager. */
  public isPaused: () => boolean = () => false;
  /** Lets the Discord side react ⏳ / ✅ / ❌ on the source message. */
  public onHeld: ((item: PendingApproval) => void) | null = null;
  public onSettled: ((item: PendingApproval, outcome: ApprovalOutcome) => void) | null = null;

  public start(io: Server): void {
    this.io = io;
    for (const item of loadPendingApprovals()) this.pending.set(item.id, item);
    this.trust = loadPosterTrust();
    logger.info({ count: this.pending.size }, "Restored pending approval(s) from DB");
    this.timer ??= setInterval(() => this.expireOld(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    this.expireOld();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  public list(): PendingApproval[] {
    return [...this.pending.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  public getTrust(userId: string): PosterTrust {
    return this.trust.get(userId) ?? { approvedCount: 0, always: false };
  }

  /**
   * Delivers the alert, or holds it when the poster needs approval.
   * `approvedLog` is what gets logged when the alert goes straight on air.
   */
  public submit(
    alert: AlertPayload,
    poster: Poster,
    opts: { censored?: boolean; approvedLog: Omit<LogEntry, "id" | "timestamp"> }
  ): "delivered" | "held" | "dropped" {
    const s = settingsManager.settings;
    const decision = decideApproval({
      mode: s.approvalMode,
      trustedRoleIds: s.approvalTrustedRoleIds,
      newPosterCount: s.approvalNewPosterCount,
      posterRoleIds: poster.roleIds,
      trust: this.getTrust(poster.id),
    });

    if (!decision.hold) {
      logManager.addLog(opts.approvedLog);
      this.deliver(alert);
      return "delivered";
    }

    if (this.pending.size >= MAX_PENDING) {
      logger.warn("Approval inbox full, dropping alert");
      logManager.addLog({ ...logBaseOf(alert), status: "blocked", reason: "Boîte de validation pleine" });
      return "dropped";
    }

    const now = Date.now();
    const item: PendingApproval = {
      id: crypto.randomUUID(),
      alert,
      posterId: poster.id,
      reason: decision.reason,
      censored: opts.censored ?? false,
      createdAt: now,
      expiresAt: now + Math.max(1, s.approvalExpiryMinutes) * 60_000,
      channelId: poster.channelId,
      messageId: poster.messageId,
    };
    this.pending.set(item.id, item);
    persistPendingApproval(item);
    this.io?.emit("approval_added", item);
    this.onHeld?.(item);
    logger.info({ author: alert.authorName, reason: decision.reason }, "Alert held for approval");
    return "held";
  }

  /** Sends an approved alert into the normal queue. */
  private deliver(alert: AlertPayload): void {
    alertManager.addAlert(alert);
    if (this.io && !this.isPaused()) this.io.emit("new_alert", alert);
  }

  private take(id: string, outcome: ApprovalOutcome): PendingApproval | null {
    const item = this.pending.get(id);
    if (!item) return null;
    this.pending.delete(id);
    removePendingApproval(id);
    this.io?.emit("approval_resolved", { id, outcome });
    return item;
  }

  public approve(id: string, opts: { always?: boolean } = {}): boolean {
    const item = this.take(id, "approved");
    if (!item) return false;

    const prev = this.getTrust(item.posterId);
    const next = { approvedCount: prev.approvedCount + 1, always: prev.always || !!opts.always };
    this.trust.set(item.posterId, next);
    persistPosterTrust(item.posterId, next);

    logManager.addLog({
      ...logBaseOf(item.alert),
      status: item.censored ? "censored" : "approved",
      reason: opts.always ? "Approuvé par le streamer (toujours approuvé)" : "Approuvé par le streamer",
    });
    // Fresh timestamp: the alert has been waiting, and the queue is ordered by it
    this.deliver({ ...item.alert, timestamp: Date.now() });
    this.onSettled?.(item, "approved");
    return true;
  }

  public reject(id: string): boolean {
    const item = this.take(id, "rejected");
    if (!item) return false;
    logManager.addLog({ ...logBaseOf(item.alert), status: "blocked", reason: "Refusé par le streamer" });
    this.onSettled?.(item, "rejected");
    return true;
  }

  public expireOld(now = Date.now()): void {
    for (const item of this.list()) {
      if (item.expiresAt > now) continue;
      this.take(item.id, "expired");
      logManager.addLog({ ...logBaseOf(item.alert), status: "blocked", reason: "Expiré sans validation" });
      this.onSettled?.(item, "expired");
    }
  }
}

export const approvalManager = new ApprovalManager();
