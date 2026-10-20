import type { Pose, PoseAlertPayload } from "../src/types.js";
import { hasMedia } from "../src/lib/poseMedia.js";
import { poseStore, visiblePoses } from "./poseStore.js";
import { settingsManager } from "./settingsManager.js";
import type { Server as SocketServer } from "socket.io";
import { expandOverlay, restoreOverlay } from "./obsManager.js";

export type PoseAlertControllerDeps = {
  getPoses: () => Pose[];
  isEnabled: () => boolean;
  now: () => number;
  setTimer: typeof setTimeout;
  clearTimer: typeof clearTimeout;
  onStuck: () => void;
};

export function createPoseAlertController(deps: PoseAlertControllerDeps) {
  let playing = false;
  let playingTimer: ReturnType<typeof setTimeout> | undefined;
  const lastTriggeredAt = new Map<string, number>();

  const done = () => {
    if (playingTimer) {
      deps.clearTimer(playingTimer);
      playingTimer = undefined;
    }
    playing = false;
  };

  const trigger = (poseId: string, opts: { ignoreCooldown?: boolean } = {}): PoseAlertPayload | null => {
    if (playing || (!opts.ignoreCooldown && !deps.isEnabled())) return null;
    const pose = deps.getPoses().find((candidate) => candidate.id === poseId);
    if (!pose || !pose.enabled || !hasMedia(pose)) return null;

    const now = deps.now();
    const last = lastTriggeredAt.get(pose.id);
    if (!opts.ignoreCooldown && last !== undefined && now - last < pose.cooldownSeconds * 1000) return null;

    if (!opts.ignoreCooldown) lastTriggeredAt.set(pose.id, now);
    playing = true;
    playingTimer = deps.setTimer(
      () => {
        playingTimer = undefined;
        playing = false;
        deps.onStuck();
      },
      (pose.media.maxDurationSeconds + 5) * 1000
    );
    return { poseId: pose.id, media: pose.media };
  };

  return {
    trigger,
    done,
    isPlaying: () => playing,
  };
}

// Overlay source stretch started by the current pose alert (resolves true if it expanded)
let poseExpand: Promise<boolean> | null = null;

async function restoreIfExpanded() {
  // Only restore what this alert expanded; awaits an expand that is still running
  const pending = poseExpand;
  poseExpand = null;
  if (pending && (await pending)) restoreOverlay().catch(() => {});
}

export const poseAlertController = createPoseAlertController({
  getPoses: () => visiblePoses(poseStore.get()),
  isEnabled: () => settingsManager.settings.poseDetectionEnabled === true,
  now: Date.now,
  setTimer: setTimeout,
  clearTimer: clearTimeout,
  onStuck: () => void restoreIfExpanded(),
});

/** Sends an alert returned by `trigger()` to the overlay and stretches the source if the pose asks for it. */
export function emitPoseAlert(io: SocketServer, alert: PoseAlertPayload) {
  io.emit("pose_alert", alert);
  // Plain assignment: only one pose alert plays at a time, so any previous value is stale
  poseExpand = alert.media.fullscreen ? expandOverlay().catch(() => false) : null;
}

/** Overlay finished the alert (`pose_alert_done`). */
export function finishPoseAlert() {
  poseAlertController.done();
  return restoreIfExpanded();
}
