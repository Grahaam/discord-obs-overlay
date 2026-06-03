import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";

const DEFAULT_MEDIA = "https://media.tenor.com/REPLACE_WITH_YOUR_GIF.gif";
const DEFAULT_SOUND = "https://REPLACE_WITH_YOUR_SOUND_URL.mp3";

function detectType(url: string): "video" | "image" {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) ? "video" : "image";
}

interface TrollPayload {
  mediaUrl: string;
  soundUrl: string;
}

export default function TrollOverlay() {
  const { socket } = useQueueStore();
  const [active, setActive] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(DEFAULT_MEDIA);
  const [soundUrl, setSoundUrl] = useState(DEFAULT_SOUND);
  const [type, setType] = useState<"video" | "image">("image");
  const origSizeRef = useRef<{ w: number; h: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ mediaUrl: m, soundUrl: s }: TrollPayload) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const finalMedia = m || DEFAULT_MEDIA;
      const finalSound = s || DEFAULT_SOUND;
      setMediaUrl(finalMedia);
      setSoundUrl(finalSound);
      setType(detectType(finalMedia));
      origSizeRef.current = { w: window.outerWidth, h: window.outerHeight };
      window.resizeTo(screen.width, screen.height);
      setActive(true);
      timerRef.current = setTimeout(dismiss, 10_000);
    };
    socket.on("troll_alert", handler);
    return () => {
      socket.off("troll_alert", handler);
    };
  }, [socket]);

  function dismiss() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActive(false);
    if (origSizeRef.current) {
      window.resizeTo(origSizeRef.current.w, origSizeRef.current.h);
      origSizeRef.current = null;
    }
  }

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      {type === "video" ? (
        <video src={mediaUrl} autoPlay muted playsInline className="w-full h-full object-contain" onEnded={dismiss} />
      ) : (
        <img src={mediaUrl} alt="" className="w-full h-full object-contain" />
      )}
      <audio src={soundUrl} autoPlay />
    </div>
  );
}
