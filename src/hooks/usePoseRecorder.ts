import { useCallback, useEffect, useRef, useState } from "react";
import type { BodyPart } from "../types";
import type { PoseFrame } from "./usePoseLandmarks";
import { MIN_GOOD_FRAMES } from "../lib/poseMatcher";
import {
  buildRecording,
  recordParts,
  seenParts,
  type RecordedFrame,
  type RecordingResult,
  type RecordPart,
} from "../lib/handRecording";

const COUNTDOWN_S = 3;
// Detection runs at ~5 fps on a typical CPU (OBS screenshot + MediaPipe), so a fixed 2 s
// window left almost no room for a blurry frame: keep capturing until enough clear frames.
const MIN_CAPTURE_MS = 2000;
const MAX_CAPTURE_MS = 6000;

export type RecorderPhase =
  { kind: "idle" } | { kind: "countdown"; seconds: number } | { kind: "capturing"; good: number; needed: number };

/**
 * 3-2-1 countdown, then frames are captured until MIN_GOOD_FRAMES clear ones (at least 2 s,
 * at most 6 s) and averaged into a template. A frame is clear when the ticked body joints and
 * every ticked hand are seen. `feed` receives every camera frame; `onDone` gets the body
 * template and hand templates, or `error` naming the first part seen too rarely.
 */
export function usePoseRecorder(onDone: (result: RecordingResult) => void) {
  const [phase, setPhase] = useState<RecorderPhase>({ kind: "idle" });
  const framesRef = useRef<RecordedFrame[]>([]);
  const seenRef = useRef<Partial<Record<RecordPart, number>>>({});
  const partsRef = useRef<BodyPart[]>([]);
  const captureStartRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const clear = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  useEffect(() => clear, []);

  const finish = useCallback(() => {
    if (captureStartRef.current === null) return;
    captureStartRef.current = null;
    clear();
    setPhase({ kind: "idle" });
    onDoneRef.current(buildRecording(framesRef.current, partsRef.current, seenRef.current));
  }, []);

  const start = useCallback(
    (bodyParts: BodyPart[]) => {
      clear();
      partsRef.current = bodyParts;
      framesRef.current = [];
      seenRef.current = {};
      captureStartRef.current = null;
      for (let s = COUNTDOWN_S; s > 0; s--) {
        timersRef.current.push(setTimeout(() => setPhase({ kind: "countdown", seconds: s }), (COUNTDOWN_S - s) * 1000));
      }
      timersRef.current.push(
        setTimeout(() => {
          captureStartRef.current = performance.now();
          setPhase({ kind: "capturing", good: 0, needed: MIN_GOOD_FRAMES });
        }, COUNTDOWN_S * 1000),
        setTimeout(finish, COUNTDOWN_S * 1000 + MAX_CAPTURE_MS)
      );
    },
    [finish]
  );

  const feed = useCallback(
    (frame: PoseFrame) => {
      const startedAt = captureStartRef.current;
      if (startedAt === null || !frame.landmarks) return;
      const seen = seenParts(frame, partsRef.current);
      for (const part of seen) seenRef.current[part] = (seenRef.current[part] ?? 0) + 1;
      if (recordParts(partsRef.current).every((part) => seen.has(part))) {
        framesRef.current.push({ landmarks: frame.landmarks, aspect: frame.aspect, hands: frame.hands });
      }
      const good = framesRef.current.length;
      setPhase({ kind: "capturing", good: Math.min(good, MIN_GOOD_FRAMES), needed: MIN_GOOD_FRAMES });
      if (good >= MIN_GOOD_FRAMES && frame.time - startedAt >= MIN_CAPTURE_MS) finish();
    },
    [finish]
  );

  return { phase, start, feed, busy: phase.kind !== "idle" };
}
