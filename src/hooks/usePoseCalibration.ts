import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseFrame } from "./usePoseLandmarks";
import { suggestThreshold, type ThresholdSuggestion } from "../lib/poseCalibration";

export const CALIBRATION_S = 8;

export type CalibrationPhase =
  | { kind: "idle" }
  | { kind: "running"; poseId: string; secondsLeft: number }
  | { kind: "done"; poseId: string; suggestion: ThresholdSuggestion | null };

/**
 * "Streaming normally" calibration: for CALIBRATION_S seconds every camera frame is scored
 * against the pose (which must not be held), then a threshold above the highest scores is suggested.
 * `feed` receives every camera frame; `scoreOf` gives the pose's score for a frame.
 */
export function usePoseCalibration(
  scoreOf: (poseId: string, frame: PoseFrame) => number | null,
  currentThreshold: (poseId: string) => number
) {
  const [phase, setPhase] = useState<CalibrationPhase>({ kind: "idle" });
  const scoresRef = useRef<number[]>([]);
  const poseRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const scoreOfRef = useRef(scoreOf);
  const thresholdRef = useRef(currentThreshold);
  useEffect(() => {
    scoreOfRef.current = scoreOf;
    thresholdRef.current = currentThreshold;
  }, [scoreOf, currentThreshold]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = useCallback((poseId: string) => {
    clearInterval(timerRef.current);
    poseRef.current = poseId;
    scoresRef.current = [];
    let secondsLeft = CALIBRATION_S;
    setPhase({ kind: "running", poseId, secondsLeft });
    timerRef.current = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) return setPhase({ kind: "running", poseId, secondsLeft });
      clearInterval(timerRef.current);
      poseRef.current = null;
      setPhase({
        kind: "done",
        poseId,
        suggestion: suggestThreshold(scoresRef.current, thresholdRef.current(poseId)),
      });
    }, 1000);
  }, []);

  const feed = useCallback((frame: PoseFrame) => {
    const poseId = poseRef.current;
    if (!poseId) return;
    const score = scoreOfRef.current(poseId, frame);
    if (score !== null) scoresRef.current.push(score);
  }, []);

  const dismiss = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, start, feed, dismiss, busy: phase.kind === "running" };
}
