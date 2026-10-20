import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import OBSWebSocket from "obs-websocket-js";
import type { NormalizedPoint } from "../types";

const FRAME_INTERVAL_MS = 100; // ~10 fps is plenty for a held pose
const FRAME_WIDTH = 320;
const RETRY_MS = 5000;
const CONN_CHECK_MS = 10_000;
const OBS_RESOURCE_NOT_FOUND = 600;

export type PoseLandmarksStatus = "idle" | "loading" | "ok" | "no-obs" | "no-source" | "error";

export interface PoseFrame {
  /** 33 MediaPipe points in image fractions (0–1), or null when nobody is detected */
  landmarks: NormalizedPoint[] | null;
  /** Frame width / height, needed to compare x and y in the same unit */
  aspect: number;
  /** The OBS screenshot the landmarks come from (jpg data URL) */
  frameUrl: string;
  /** performance.now() when the frame was analysed */
  time: number;
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

/**
 * Grabs frames of an OBS source through obs-websocket (no webcam access needed) and runs
 * MediaPipe pose detection on them. Shared by the overlay detector and the dashboard
 * Poses tab, so both see exactly the same camera, crop and landmarks.
 */
export function usePoseLandmarks({
  active,
  sourceName,
  onFrame,
}: {
  active: boolean;
  sourceName: string;
  onFrame?: (frame: PoseFrame) => void;
}) {
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [status, setStatus] = useState<PoseLandmarksStatus>("idle");
  // Ref so a new callback each render doesn't restart the capture loop
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!active || !sourceName) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let landmarker: PoseLandmarker | null = null;
    const obs = new OBSWebSocket();
    let obsConnected = false;
    let usedConn: ObsConnection | null = null;
    let lastConnCheck = 0;

    obs.on("ConnectionClosed", () => {
      obsConnected = false;
    });

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      try {
        if (!landmarker) {
          setStatus("loading");
          const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            // CPU: OBS browser sources may run without GPU acceleration
            baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: "CPU" },
            // IMAGE: frames are independent screenshots; VIDEO tracking lags and "remembers" raised hands
            runningMode: "IMAGE",
            numPoses: 1,
          });
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
            imageWidth: FRAME_WIDTH,
          }));
        } catch (err) {
          if ((err as { code?: number }).code === OBS_RESOURCE_NOT_FOUND) setStatus("no-source");
          throw err;
        }
        const bitmap = await createImageBitmap(dataUrlToBlob(imageData));
        const aspect = bitmap.width / bitmap.height;
        const result = landmarker.detect(bitmap);
        bitmap.close();
        if (stopped) return;

        const next: PoseFrame = {
          landmarks: result.landmarks[0]?.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })) ?? null,
          aspect,
          frameUrl: imageData,
          time: performance.now(),
        };
        setStatus("ok");
        setFrame(next);
        onFrameRef.current?.(next);
        schedule(FRAME_INTERVAL_MS);
      } catch (err) {
        console.warn("[usePoseLandmarks]", err);
        setStatus((s) => (s === "no-obs" || s === "no-source" ? s : "error"));
        schedule(RETRY_MS);
      }
    };

    schedule(0);

    return () => {
      stopped = true;
      clearTimeout(timer);
      landmarker?.close();
      obs.disconnect().catch(() => {});
      setFrame(null);
      setStatus("idle");
    };
  }, [active, sourceName]);

  return { frame, status };
}
