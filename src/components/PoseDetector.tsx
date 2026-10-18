import { useEffect, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import OBSWebSocket from "obs-websocket-js";
import { useQueueStore } from "../store/queueStore";
import { isAbsoluteCinemaPose } from "../lib/absoluteCinemaPose";

// Same endpoint as server/obsManager.ts
const OBS_WS_URL = "ws://localhost:4455";
const FRAME_INTERVAL_MS = 100; // ~10 fps is plenty for a held pose
const FRAME_WIDTH = 320;
const HOLD_MS = 600;
const RETRY_MS = 5000;

interface PoseSettings {
  poseDetectionEnabled?: boolean;
  poseCameraSource?: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/**
 * Headless component mounted on /overlay. Grabs frames of the streamer's camera source
 * through obs-websocket (no webcam access needed), runs MediaPipe pose detection, and
 * notifies the server when the "Absolute Cinema" pose is held. Cooldown is server-side.
 */
export default function PoseDetector({ isLeader }: { isLeader: boolean }) {
  const [settings, setSettings] = useState<PoseSettings | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: PoseSettings | null) => setSettings(s))
      .catch(() => {});
  }, []);

  // Only the leader overlay tab runs detection, same as playback.

  const sourceName = settings?.poseCameraSource?.trim();
  const enabled = isLeader && settings?.poseDetectionEnabled === true && !!sourceName;

  useEffect(() => {
    if (!enabled || !sourceName) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let landmarker: PoseLandmarker | null = null;
    const obs = new OBSWebSocket();
    let obsConnected = false;
    let poseSince: number | null = null;

    obs.on("ConnectionClosed", () => {
      obsConnected = false;
    });

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      try {
        if (!landmarker) {
          const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            // CPU: OBS browser sources may run without GPU acceleration
            baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: "CPU" },
            // IMAGE: frames are independent screenshots; VIDEO tracking lags and "remembers" raised hands
            runningMode: "IMAGE",
            numPoses: 1,
          });
        }
        if (!obsConnected) {
          await obs.connect(OBS_WS_URL);
          obsConnected = true;
        }

        const { imageData } = await obs.call("GetSourceScreenshot", {
          sourceName,
          imageFormat: "jpg",
          imageWidth: FRAME_WIDTH,
        });
        const bitmap = await createImageBitmap(dataUrlToBlob(imageData));
        const now = performance.now();
        const result = landmarker.detect(bitmap);
        bitmap.close();

        const landmarks = result.landmarks[0];
        if (landmarks && isAbsoluteCinemaPose(landmarks)) {
          poseSince ??= now;
          if (now - poseSince >= HOLD_MS) {
            useQueueStore.getState().socketRef.current?.emit("pose_detected", { pose: "absolute_cinema" });
            poseSince = null;
          }
        } else {
          poseSince = null;
        }
        schedule(FRAME_INTERVAL_MS);
      } catch (err) {
        console.warn("[PoseDetector]", err);
        schedule(RETRY_MS);
      }
    };

    schedule(0);

    return () => {
      stopped = true;
      clearTimeout(timer);
      landmarker?.close();
      obs.disconnect().catch(() => {});
    };
  }, [enabled, sourceName]);

  return null;
}
