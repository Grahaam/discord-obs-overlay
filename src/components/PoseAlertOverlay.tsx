import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";

const VISIBLE_MS = 1000;
const FADE_MS = 500;

interface PoseAlertPayload {
  imageUrl: string;
  soundUrl: string;
}

/** Full-screen "Absolute Cinema" flash: shown above everything, then fades out. */
export default function PoseAlertOverlay() {
  const { socket } = useQueueStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!socket) return;
    const clearTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    const handler = ({ imageUrl: img, soundUrl }: PoseAlertPayload) => {
      clearTimers();
      setImageUrl(img);
      setFading(false);
      // Not tied to the DOM, so the sound keeps playing after the image has faded out
      if (soundUrl) new Audio(soundUrl).play().catch(() => {});
      timersRef.current = [
        setTimeout(() => setFading(true), VISIBLE_MS),
        setTimeout(() => setImageUrl(null), VISIBLE_MS + FADE_MS),
      ];
    };
    socket.on("pose_alert", handler);
    return () => {
      socket.off("pose_alert", handler);
      clearTimers();
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
