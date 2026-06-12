import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";

const DEFAULT_MEDIA =
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaXdqeHFycjZ2dTMxeHFsMjJ6eDh2b3B0a3Z4aTl5YTY3eXF3OTcxYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/JymRvCWcasbdMVXcVA/giphy.gif";
const DEFAULT_SOUND = "https://www.myinstants.com/media/sounds/absolute-cinema-meme.mp3";

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ mediaUrl: m, soundUrl: s }: TrollPayload) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const finalMedia = m || (s ? "" : DEFAULT_MEDIA);
      const finalSound = s || DEFAULT_SOUND;
      const mediaType = detectType(finalMedia);
      setMediaUrl(finalMedia);
      setSoundUrl(finalSound);
      setType(mediaType);
      setActive(true);
      if (mediaType !== "video") {
        // fallback: dismiss if onEnded never fires (autoplay blocked, 404, etc.)
        timerRef.current = setTimeout(dismiss, s ? 30_000 : 10_000);
      }
    };
    socket.on("troll_alert", handler);
    return () => {
      socket.off("troll_alert", handler);
    };
  }, [socket, dismiss]);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActive(false);
    socket?.emit("troll_dismissed");
  }, [socket]);

  if (!active) return null;

  if (!mediaUrl && type !== "video") {
    return <audio src={soundUrl} autoPlay onEnded={dismiss} />;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      {type === "video" ? (
        <video src={mediaUrl} autoPlay playsInline className="w-full h-full object-contain" onEnded={dismiss} />
      ) : (
        <>
          <img src={mediaUrl} alt="" className="w-full h-full object-contain" />
          <audio src={soundUrl} autoPlay onEnded={dismiss} />
        </>
      )}
    </div>
  );
}
