import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import OBSWebSocket from "obs-websocket-js";
import type { NormalizedPoint } from "../types";
import { CROP_PX } from "../lib/handCrop";
import { runHandPass, type HandLandmarkers, type LiveCrops, type LiveHands } from "../lib/handPass";

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
  /** Hand crops in screenshot pixels, for the visualiser */
  crops?: LiveCrops;
  /** Size of the screenshot the crops refer to */
  frameWidth?: number;
  frameHeight?: number;
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

/** Two instances (numHands 1 per crop, numHands 2 for the merged crop) so options never switch per frame. */
async function createHandLandmarkers(vision: Vision, delegate: Delegate): Promise<HandLandmarkers> {
  const create = (numHands: number) =>
    withFallback(delegate, (d) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: d },
        runningMode: "IMAGE",
        numHands,
      })
    );
  const single = await create(1);
  try {
    return { single, double: await create(2) };
  } catch (err) {
    single.close();
    throw err;
  }
}

/**
 * Grabs frames of an OBS source through obs-websocket (no webcam access needed) and runs
 * MediaPipe pose detection on them. Shared by the overlay detector and the dashboard
 * Poses tab, so both see exactly the same camera, crop and landmarks.
 * With `hands`, the hand model also runs on crops around the requested wrists.
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
    let handLandmarkers: HandLandmarkers | null = null;
    let handsFailed = false; // one failed load per hook instance, never retried
    let previousHands: LiveHands = {};
    let bodyCtx: OffscreenCanvasRenderingContext2D | null = null;
    let cropCtx: OffscreenCanvasRenderingContext2D | null = null;

    obs.on("ConnectionClosed", () => {
      obsConnected = false;
    });

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, ms);
    };

    // Lazy: only the first frame that needs hands pays for the model; a failure is final for this instance
    const loadHands = async (v: Vision) => {
      try {
        const made = await createHandLandmarkers(v, delegate);
        if (stopped) {
          made.single.close();
          made.double.close();
          return;
        }
        handLandmarkers = made;
      } catch (err) {
        console.warn("[usePoseLandmarks] hand model unavailable, body only", err);
        handsFailed = true;
      }
    };

    const tick = async () => {
      try {
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

        let imageData: string;
        try {
          ({ imageData } = await obs.call("GetSourceScreenshot", {
            sourceName,
            imageFormat: "jpg",
            imageWidth: wantHands ? HAND_FRAME_WIDTH : FRAME_WIDTH,
          }));
        } catch (err) {
          if ((err as { code?: number }).code === OBS_RESOURCE_NOT_FOUND) setStatus("no-source");
          throw err;
        }
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
        setStatus((s) => (s === "no-obs" || s === "no-source" ? s : "error"));
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

      if (landmarks && !handLandmarkers && !handsFailed) await loadHands(vision!);
      if (!landmarks || !handLandmarkers || stopped) {
        previousHands = {};
        return next;
      }
      cropCtx ??= new OffscreenCanvas(CROP_PX, CROP_PX).getContext("2d");
      if (!cropCtx) throw new Error("no 2d context");
      const pass = runHandPass({
        landmarkers: handLandmarkers,
        ctx: cropCtx,
        source: bitmap,
        body: landmarks,
        sides: { left: wantLeft, right: wantRight },
        previous: previousHands,
        now: time,
      });
      previousHands = pass.hands; // a side not found this frame is dropped, not followed
      return { ...next, ...pass, frameWidth: bitmap.width, frameHeight: bitmap.height };
    };

    schedule(0);

    return () => {
      stopped = true;
      clearTimeout(timer);
      landmarker?.close();
      handLandmarkers?.single.close();
      handLandmarkers?.double.close();
      obs.disconnect().catch(() => {});
      setFrame(null);
      setStatus("idle");
    };
  }, [active, sourceName, wantLeft, wantRight, delegate]);

  return { frame, status };
}
