import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";
import { usePoseLandmarks, type PoseFrame } from "../hooks/usePoseLandmarks";
import { usePoses } from "../hooks/usePoses";
import { createHoldTracker } from "../lib/poseMatcher";
import { detectablePoses, posesNeedHands, scoreFrame } from "../lib/poseScoring";

interface PoseSettings {
  poseDetectionEnabled?: boolean;
  poseCameraSource?: string;
}

/**
 * Headless component mounted on /overlay. Scores each camera frame against every
 * detectable pose and tells the server which one was held long enough (best match wins).
 * Cooldowns and "one alert at a time" are decided server-side.
 */
export default function PoseDetector({ isLeader }: { isLeader: boolean }) {
  const [settings, setSettings] = useState<PoseSettings | null>(null);
  const { file } = usePoses(); // follows poses_updated, so dashboard edits apply without a reload

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: PoseSettings | null) => setSettings(s))
      .catch(() => {});
  }, []);

  const poses = useMemo(() => (file ? detectablePoses(file) : []), [file]);
  const posesRef = useRef(poses);
  useEffect(() => {
    posesRef.current = poses;
  }, [poses]);
  // Memoised so the capture loop only restarts when the needed hands change
  const hands = useMemo(() => posesNeedHands(poses), [poses]);
  const trackerRef = useRef(createHoldTracker());

  const onFrame = useCallback((frame: PoseFrame) => {
    const scores = scoreFrame(posesRef.current, frame.landmarks, frame.aspect, frame.hands);
    const poseId = trackerRef.current.update(scores, frame.time);
    if (poseId) useQueueStore.getState().socketRef.current?.emit("pose_detected", { poseId });
  }, []);

  // Only the leader overlay tab runs detection, same as playback.
  const sourceName = settings?.poseCameraSource?.trim() ?? "";
  usePoseLandmarks({
    active: isLeader && settings?.poseDetectionEnabled === true && poses.length > 0,
    sourceName,
    onFrame,
    hands,
  });

  return null;
}
