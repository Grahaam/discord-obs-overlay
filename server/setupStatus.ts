import type { ChannelIssue } from "../src/types.js";
import type { ObsTestResult } from "./obsManager.js";

export interface SetupStatus {
  bot: boolean;
  overlay: boolean;
  obs: boolean;
  testAlertSeen: boolean;
  details: {
    botStatus: string;
    channelConfigured: boolean;
    channelIssue: ChannelIssue | null;
    overlayClients: number;
    obsErrorCode: "unreachable" | "auth_failed" | "other" | null;
    obsError: string | null;
    obsVersion: string | null;
  };
}

export interface SetupInputs {
  botStatus: string;
  channelConfigured: boolean;
  channelIssue: ChannelIssue | null;
  overlayClients: number;
  obs: ObsTestResult;
  testAlertSeen: boolean;
}

/** Pure: turns the raw server state into the checklist booleans (+ the details the UI shows on failures). */
export function computeSetupStatus(i: SetupInputs): SetupStatus {
  return {
    bot: i.botStatus === "connected" && i.channelConfigured && i.channelIssue === null,
    overlay: i.overlayClients > 0,
    obs: i.obs.ok,
    testAlertSeen: i.testAlertSeen,
    details: {
      botStatus: i.botStatus,
      channelConfigured: i.channelConfigured,
      channelIssue: i.channelIssue,
      overlayClients: i.overlayClients,
      obsErrorCode: i.obs.ok ? null : i.obs.errorCode,
      obsError: i.obs.ok ? null : i.obs.error,
      obsVersion: i.obs.ok ? i.obs.obsVersion : null,
    },
  };
}

// Sockets that announced themselves as the OBS overlay page (register_overlay), removed on disconnect.
// A plain connected-socket count would also include the dashboard itself.
const overlaySockets = new Set<string>();
export const overlayClients = {
  add: (id: string) => void overlaySockets.add(id),
  remove: (id: string) => void overlaySockets.delete(id),
  count: () => overlaySockets.size,
};

// Ids of alerts the overlay has started playing (alert_started); bounded, we only ever look up recent test alerts
const MAX_STARTED = 50;
const startedAlertIds: string[] = [];
export function markAlertStarted(id: string) {
  if (typeof id !== "string" || startedAlertIds.includes(id)) return;
  startedAlertIds.push(id);
  if (startedAlertIds.length > MAX_STARTED) startedAlertIds.shift();
}
export function wasAlertStarted(id: string | undefined): boolean {
  return !!id && startedAlertIds.includes(id);
}

/** Wraps a slow check so concurrent/frequent callers (2 s polling) share one result for `ttlMs`. */
export function cached<T>(ttlMs: number, fn: () => Promise<T>, now: () => number = Date.now): () => Promise<T> {
  let value: { at: number; promise: Promise<T> } | null = null;
  return () => {
    if (!value || now() - value.at >= ttlMs) value = { at: now(), promise: fn() };
    return value.promise;
  };
}
