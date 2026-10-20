import type { Pose, PoseAlertPayload } from "../src/types.js";
import { hasMedia } from "../src/lib/poseMedia.js";
import { poseStore, visiblePoses } from "./poseStore.js";
import { settingsManager } from "./settingsManager.js";
import { restoreOverlay } from "./obsManager.js";

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

export const poseAlertController = createPoseAlertController({
  getPoses: () => visiblePoses(poseStore.get()),
  isEnabled: () => settingsManager.settings.poseDetectionEnabled === true,
  now: Date.now,
  setTimer: setTimeout,
  clearTimer: clearTimeout,
  onStuck: () => {
    restoreOverlay().catch(() => {});
  },
});
