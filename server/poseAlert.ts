import { settingsManager } from "./settingsManager.js";

export interface PoseAlertPayload {
  imageUrl: string;
  soundUrl: string;
}

let lastTriggeredAt = 0;

/**
 * Returns the "Absolute Cinema" alert to show, or null when the feature is off
 * or still in cooldown. The cooldown lives here so a misbehaving client can't spam alerts.
 */
export function createPoseAlert(): PoseAlertPayload | null {
  const s = settingsManager.settings;
  if (!s.poseDetectionEnabled || !s.poseAlertImageUrl) return null;

  const now = Date.now();
  if (now - lastTriggeredAt < (s.poseCooldownSeconds ?? 30) * 1000) return null;
  lastTriggeredAt = now;

  return { imageUrl: s.poseAlertImageUrl, soundUrl: s.poseAlertSoundUrl || "" };
}
