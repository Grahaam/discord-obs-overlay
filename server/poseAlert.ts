import crypto from "crypto";
import { AlertPayload } from "../src/types.js";
import { settingsManager } from "./settingsManager.js";

const POSE_ALERT_DURATION_MS = 4000;

let lastTriggeredAt = 0;

/**
 * Builds the "Absolute Cinema" alert, or returns null when the feature is off
 * or still in cooldown. The cooldown lives here so a misbehaving client can't spam alerts.
 */
export function createPoseAlert(): AlertPayload | null {
  const s = settingsManager.settings;
  if (!s.poseDetectionEnabled || !s.poseAlertImageUrl) return null;

  const now = Date.now();
  if (now - lastTriggeredAt < (s.poseCooldownSeconds ?? 30) * 1000) return null;
  lastTriggeredAt = now;

  return {
    id: crypto.randomUUID(),
    authorName: "Absolute Cinema",
    authorAvatar: s.poseAlertImageUrl,
    text: "",
    mediaUrl: s.poseAlertImageUrl,
    type: "image",
    duration: POSE_ALERT_DURATION_MS,
    syncDurationWithMedia: false,
    neonColor: s.neonColor,
    alertStyle: s.alertStyle,
    stopAlertShortcut: s.stopAlertShortcut || "Escape",
    alertSoundUrl: s.poseAlertSoundUrl || "",
    alertFont: s.alertFont || "sans",
    alertPosition: s.alertPosition || "bottom-left",
    alertScale: s.alertScale ?? 1,
    alertBgOpacity: s.alertBgOpacity ?? 0.9,
    alertAnimation: s.alertAnimation || "slide-up",
    timestamp: now,
  };
}
