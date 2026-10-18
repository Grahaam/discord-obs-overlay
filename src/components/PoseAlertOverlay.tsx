import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";

// 2 s in total: fully visible, then image and sound fade out together
const VISIBLE_MS = 1500;
const FADE_MS = 500;

interface PoseAlertPayload {
  imageUrl: string;
  soundUrl: string;
}

interface PoseAlertOverlayProps {
  onShow?: () => void;
  onHide?: () => void;
}

/** Full-screen "Absolute Cinema" flash: shown above everything, then fades out. */
export default function PoseAlertOverlay({ onShow, onHide }: PoseAlertOverlayProps) {
  const { socket } = useQueueStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Refs so the socket handler always calls the latest callbacks without re-subscribing
  const onShowRef = useRef(onShow);
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onShowRef.current = onShow;
    onHideRef.current = onHide;
  }, [onShow, onHide]);

  useEffect(() => {
    if (!socket) return;
    let audio: HTMLAudioElement | null = null;
    let fadeInterval: ReturnType<typeof setInterval> | undefined;
    const stopSound = () => {
      clearInterval(fadeInterval);
      audio?.pause();
      audio = null;
    };
    const clearTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    const handler = ({ imageUrl: img, soundUrl }: PoseAlertPayload) => {
      clearTimers();
      stopSound();
      onShowRef.current?.();
      setImageUrl(img);
      setFading(false);
      if (soundUrl) {
        audio = new Audio(soundUrl);
        audio.play().catch((err) => console.warn("[PoseAlertOverlay] sound blocked", err));
      }
      timersRef.current = [
        setTimeout(() => {
          setFading(true);
          // Fade the sound with the image (audio volume has no CSS transition, so step it down)
          const fadingAudio = audio;
          if (!fadingAudio) return;
          const steps = 10;
          let step = 0;
          fadeInterval = setInterval(() => {
            step++;
            fadingAudio.volume = Math.max(0, 1 - step / steps);
          }, FADE_MS / steps);
        }, VISIBLE_MS),
        setTimeout(() => {
          stopSound();
          setImageUrl(null);
          onHideRef.current?.();
          socket.emit("pose_alert_done");
        }, VISIBLE_MS + FADE_MS),
      ];
    };
    socket.on("pose_alert", handler);
    return () => {
      socket.off("pose_alert", handler);
      clearTimers();
      stopSound();
    };
  }, [socket]);

  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black flex items-center justify-center pointer-events-none transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <img src={imageUrl} alt="" className="w-full h-full object-contain" />
    </div>
  );
}
