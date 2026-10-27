import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import OBSWebSocket from "obs-websocket-js";
import type { NormalizedPoint } from "../types";
import { runHandPass, type LiveHands } from "../lib/handPass";

const FRAME_INTERVAL_MS = 100; // ~10 fps is plenty for a held pose
const FRAME_WIDTH = 320;
const HAND_FRAME_WIDTH = 640; // hands need detail: grab bigger, give the body model a 320 px copy
const RETRY_MS = 5000;
const CONN_CHECK_MS = 10_000;
const OBS_RESOURCE_NOT_FOUND = 600;

export type PoseLandmarksStatus =
  | "idle"
  | "loading"
  | "ok"
  | "no-obs"
  | "no-source"
  | "no-picture"
  | "error"
  /** Body detection works but the hand model failed to load (a warning: frames keep flowing) */
  | "hands-unavailable";

type Delegate = "CPU" | "GPU";
type Vision = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

export interface PoseFrame {
  /** 33 MediaPipe points in image fractions (0–1), or null when nobody is detected */
  landmarks: NormalizedPoint[] | null;
  /** Frame width / height, needed to compare x and y in the same unit */
  aspect: number;
  /** The OBS screenshot the landmarks come from (jpg data URL) */
  frameUrl: string;
  /** performance.now() when the frame was analysed */
  time: number;
  /** Hands found this frame (only when hands were requested) */
  hands?: LiveHands;
}

interface ObsConnection {
  port: number;
  password: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Creates with the asked delegate; a GPU failure retries once on CPU. */
async function withFallback<T>(delegate: Delegate, create: (d: Delegate) => Promise<T>): Promise<T> {
  if (delegate === "CPU") return create("CPU");
  try {
    return await create("GPU");
  } catch (err) {
    console.warn("[usePoseLandmarks] GPU delegate failed, using CPU", err);
    return create("CPU");
  }
}

/** Two hands, whole frame: each found hand is matched to a body wrist afterwards. */
function createHandLandmarker(vision: Vision, delegate: Delegate): Promise<HandLandmarker> {
  return withFallback(delegate, (d) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: d },
      runningMode: "IMAGE",
      numHands: 2,
    })
  );
}

/**
 * Grabs frames of an OBS source through obs-websocket (no webcam access needed) and runs
 * MediaPipe pose detection on them. Shared by the overlay detector and the dashboard
 * Poses tab, so both see exactly the same camera framing and landmarks.
 * With `hands`, the hand model also runs on the whole (bigger) screenshot.
 */
export function usePoseLandmarks({
  active,
  sourceName,
  onFrame,
  hands,
  delegate = "CPU",
}: {
  active: boolean;
  sourceName: string;
  onFrame?: (frame: PoseFrame) => void;
  hands?: { left: boolean; right: boolean };
  delegate?: Delegate;
}) {
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [status, setStatus] = useState<PoseLandmarksStatus>("idle");
  // Ref so a new callback each render doesn't restart the capture loop
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  // Booleans, not the object, so a new { left, right } each render doesn't restart the loop
  const wantLeft = hands?.left === true;
  const wantRight = hands?.right === true;

  useEffect(() => {
    if (!active || !sourceName) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let vision: Vision | null = null;
    let landmarker: PoseLandmarker | null = null;
    const obs = new OBSWebSocket();
    let obsConnected = false;
    let usedConn: ObsConnection | null = null;
    let lastConnCheck = 0;

    const wantHands = wantLeft || wantRight;
    let handLandmarker: HandLandmarker | null = null;
    let handsFailed = false; // one failed load per hook instance, never retried
    let handPassWarned = false;
    let bodyCtx: OffscreenCanvasRenderingContext2D | null = null;

    obs.on("ConnectionClosed", () => {
      obsConnected = false;
    });

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, ms);
    };

    // Lazy: only the first frame that needs hands pays for the model; a failure is final for this instance
    const loadHands = async (v: Vision) => {
      try {
        const made = await createHandLandmarker(v, delegate);
        if (stopped) {
          made.close();
          return;
        }
        handLandmarker = made;
      } catch (err) {
        console.warn("[usePoseLandmarks] hand model unavailable, body only", err);
        handsFailed = true;
      }
    };

    // OBS browser sources have no devtools: send each new failure to the server log (dashboard "server logs")
    let stage = "start";
    let lastReported = "";
    const reportFailure = (err: unknown) => {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (message === lastReported) return;
      lastReported = message;
      fetch("/api/overlay-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, message, userAgent: navigator.userAgent }),
      }).catch(() => {});
    };

    const onCspViolation = (e: SecurityPolicyViolationEvent) =>
      !e.blockedURI.includes("googleapis.com/v1/log") && // MediaPipe telemetry, blocked on purpose
      reportFailure(new Error(`CSP blocked ${e.violatedDirective} (${e.blockedURI || "inline/eval"})`));
    document.addEventListener("securitypolicyviolation", onCspViolation);

    const tick = async () => {
      try {
        stage = "load-model";
        if (!landmarker) {
          setStatus("loading");
          vision ??= await FilesetResolver.forVisionTasks("/mediapipe/wasm");
          const v = vision;
          landmarker = await withFallback(delegate, (d) =>
            PoseLandmarker.createFromOptions(v, {
              // CPU by default: OBS browser sources may run without GPU acceleration
              baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: d },
              // IMAGE: frames are independent screenshots; VIDEO tracking lags and "remembers" raised hands
              runningMode: "IMAGE",
              numPoses: 1,
            })
          );
        }
        // Re-read the settings now and then: a changed port/password must replace a healthy connection
        stage = "obs-connect";
        if (!obsConnected || performance.now() - lastConnCheck >= CONN_CHECK_MS) {
          lastConnCheck = performance.now();
          const res = await fetch("/api/obs-connection");
          if (!res.ok) throw new Error(`obs-connection: HTTP ${res.status}`);
          const conn: ObsConnection = await res.json();
          if (obsConnected && (conn.port !== usedConn?.port || conn.password !== usedConn?.password)) {
            await obs.disconnect().catch(() => {});
            obsConnected = false;
          }
          if (!obsConnected) {
            try {
              await obs.connect(`ws://localhost:${conn.port}`, conn.password || undefined);
            } catch (err) {
              setStatus("no-obs");
              throw err;
            }
            usedConn = conn;
            obsConnected = true;
          }
        }

        stage = "screenshot";
        let imageData: string;
        try {
          ({ imageData } = await obs.call("GetSourceScreenshot", {
            sourceName,
            imageFormat: "jpg",
            imageWidth: wantHands ? HAND_FRAME_WIDTH : FRAME_WIDTH,
          }));
        } catch (err) {
          if ((err as { code?: number }).code === OBS_RESOURCE_NOT_FOUND) setStatus("no-source");
          // The source exists but is 0×0, e.g. a webcam that didn't come back after a restart
          else if (/render screenshot/i.test((err as Error).message)) setStatus("no-picture");
          throw err;
        }
        stage = "detect";
        const bitmap = await createImageBitmap(dataUrlToBlob(imageData));
        const aspect = bitmap.width / bitmap.height;
        let next: PoseFrame;
        try {
          next = await analyse(bitmap, imageData, aspect);
        } finally {
          bitmap.close();
        }
        if (stopped) return;

        setStatus(handsFailed ? "hands-unavailable" : "ok");
        setFrame(next);
        onFrameRef.current?.(next);
        schedule(FRAME_INTERVAL_MS);
      } catch (err) {
        console.warn("[usePoseLandmarks]", err);
        reportFailure(err);
        setStatus((s) => (s === "no-obs" || s === "no-source" || s === "no-picture" ? s : "error"));
        schedule(RETRY_MS);
      }
    };

    const analyse = async (bitmap: ImageBitmap, frameUrl: string, aspect: number): Promise<PoseFrame> => {
      let result;
      if (wantHands) {
        // The body model keeps its 320 px input; its landmarks are fractions, so they fit the big frame too
        const h = Math.round((FRAME_WIDTH * bitmap.height) / bitmap.width);
        if (!bodyCtx || bodyCtx.canvas.height !== h) bodyCtx = new OffscreenCanvas(FRAME_WIDTH, h).getContext("2d");
        if (!bodyCtx) throw new Error("no 2d context");
        bodyCtx.drawImage(bitmap, 0, 0, FRAME_WIDTH, h);
        result = landmarker!.detect(bodyCtx.canvas);
      } else {
        result = landmarker!.detect(bitmap);
      }
      const landmarks = result.landmarks[0]?.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })) ?? null;
      const time = performance.now();
      const next: PoseFrame = { landmarks, aspect, frameUrl, time };
      if (!wantHands) return next;

      if (landmarks && !handLandmarker && !handsFailed) await loadHands(vision!);
      if (!landmarks || !handLandmarker || stopped) return next;
      let hands: LiveHands;
      try {
        ({ hands } = runHandPass({
          landmarker: handLandmarker,
          source: bitmap,
          body: landmarks,
          sides: { left: wantLeft, right: wantRight },
          now: time,
        }));
      } catch (err) {
        // A hand model error must not cost the body frame: skip the hands this frame
        if (!handPassWarned) console.warn("[usePoseLandmarks] hand pass failed", err);
        handPassWarned = true;
        return next;
      }
      return { ...next, hands };
    };

    schedule(0);

    return () => {
      stopped = true;
      document.removeEventListener("securitypolicyviolation", onCspViolation);
      clearTimeout(timer);
      landmarker?.close();
      handLandmarker?.close();
      obs.disconnect().catch(() => {});
      setFrame(null);
      setStatus("idle");
    };
  }, [active, sourceName, wantLeft, wantRight, delegate]);

  return { frame, status };
}
