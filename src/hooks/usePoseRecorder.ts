import { useCallback, useEffect, useRef, useState } from "react";
import type { BodyPart, NormalizedPoint } from "../types";
import type { PoseFrame } from "./usePoseLandmarks";
import { averageTemplate } from "../lib/poseMatcher";

const COUNTDOWN_S = 3;
const CAPTURE_MS = 2000;

export type RecorderPhase = { kind: "idle" } | { kind: "countdown"; seconds: number } | { kind: "capturing" };

/**
 * 3-2-1 countdown, then ~2 s of frames averaged into a template. `feed` receives every
 * camera frame; `onDone` gets the template, or null when too few frames showed the body parts.
 */
export function usePoseRecorder(onDone: (template: NormalizedPoint[] | null) => void) {
  const [phase, setPhase] = useState<RecorderPhase>({ kind: "idle" });
  const framesRef = useRef<NormalizedPoint[][]>([]);
  const aspectRef = useRef(16 / 9);
  const partsRef = useRef<BodyPart[]>([]);
  const capturingRef = useRef(false);
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

  const start = useCallback((bodyParts: BodyPart[]) => {
    clear();
    partsRef.current = bodyParts;
    framesRef.current = [];
    for (let s = COUNTDOWN_S; s > 0; s--) {
      timersRef.current.push(setTimeout(() => setPhase({ kind: "countdown", seconds: s }), (COUNTDOWN_S - s) * 1000));
    }
    timersRef.current.push(
      setTimeout(() => {
        capturingRef.current = true;
        setPhase({ kind: "capturing" });
      }, COUNTDOWN_S * 1000),
      setTimeout(
        () => {
          capturingRef.current = false;
          setPhase({ kind: "idle" });
          onDoneRef.current(averageTemplate(framesRef.current, aspectRef.current, partsRef.current));
        },
        COUNTDOWN_S * 1000 + CAPTURE_MS
      )
    );
  }, []);

  const feed = useCallback((frame: PoseFrame) => {
    if (!capturingRef.current || !frame.landmarks) return;
    framesRef.current.push(frame.landmarks);
    aspectRef.current = frame.aspect;
  }, []);

  return { phase, start, feed, busy: phase.kind !== "idle" };
}
