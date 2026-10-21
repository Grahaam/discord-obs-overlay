import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";
import type { PoseAlertPayload } from "../types";

const FADE_MS = 500;

interface PoseAlertOverlayProps {
  onShow?: () => void;
  onHide?: () => void;
}

/** Full-screen pose alert: media ends first, then fades out before notifying the server. */
export default function PoseAlertOverlay({ onShow, onHide }: PoseAlertOverlayProps) {
  const { socket } = useQueueStore();
  const [alert, setAlert] = useState<PoseAlertPayload | null>(null);
  const [fading, setFading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishedRef = useRef(false);
  const finishRef = useRef<() => void>(() => {});
  const onShowRef = useRef(onShow);
  const onHideRef = useRef(onHide);

  useEffect(() => {
    onShowRef.current = onShow;
    onHideRef.current = onHide;
  }, [onShow, onHide]);

  useEffect(() => {
    if (!socket) return;

    const clearTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    const stopAudio = () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = undefined;
      audioRef.current?.pause();
      audioRef.current = null;
    };
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setFading(true);
      const audio = audioRef.current;
      if (audio) {
        let step = 0;
        const steps = 10;
        fadeIntervalRef.current = setInterval(() => {
          step++;
          audio.volume = Math.max(0, audio.volume - 1 / steps);
          if (step >= steps && fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = undefined;
          }
        }, FADE_MS / steps);
      }
      timersRef.current.push(
        setTimeout(() => {
          stopAudio();
          setAlert(null);
          setFading(false);
          onHideRef.current?.();
          socket.emit("pose_alert_done");
        }, FADE_MS)
      );
    };
    finishRef.current = finish;

    const handler = (next: PoseAlertPayload) => {
      clearTimers();
      stopAudio();
      finishedRef.current = false;
      onShowRef.current?.();
      setFading(false);
      setAlert(next);

      const { media } = next;
      if (media.type === "image" && media.soundUrl) {
        const audio = new Audio(media.soundUrl);
        audio.volume = media.volume;
        audio.addEventListener("ended", finish);
        audio.addEventListener("error", finish);
        audioRef.current = audio;
        audio.play().catch((err) => {
          // No "ended" will come: show the image for its duration instead of the max timeout
          console.warn("[PoseAlertOverlay] sound blocked", err);
          timersRef.current.push(setTimeout(finish, (media.durationSeconds ?? 4) * 1000));
        });
      } else if (media.type === "image" && media.durationSeconds) {
        timersRef.current.push(setTimeout(finish, media.durationSeconds * 1000));
      }
      timersRef.current.push(setTimeout(finish, media.maxDurationSeconds * 1000));
    };

    socket.on("pose_alert", handler);
    return () => {
      socket.off("pose_alert", handler);
      clearTimers();
      stopAudio();
      finishRef.current = () => {};
    };
  }, [socket]);

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black flex items-center justify-center pointer-events-none transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      {alert.media.type === "video" ? (
        <video
          src={alert.media.videoUrl}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-contain"
          onCanPlay={(event) => {
            event.currentTarget.volume = alert.media.volume;
          }}
          onEnded={() => finishRef.current()}
          onError={() => finishRef.current()}
        />
      ) : (
        <img
          src={alert.media.imageUrl}
          alt=""
          className="w-full h-full object-contain"
          onError={() => finishRef.current()}
        />
      )}
    </div>
  );
}
