import { useEffect, useState } from "react";
import { useQueueStore } from "../store/queueStore";

/**
 * Shows a transient "preparing" pill while the bundled yt-dlp finishes its
 * first-run self-extraction. The server emits `media_engine_status` on connect
 * (current readiness) and `media_engine_ready` once warm-up completes. Defaults
 * to ready so already-warm sessions never flash the badge.
 */
export default function MediaEngineBadge() {
  const { socket } = useQueueStore();
  const [ready, setReady] = useState(true);

  useEffect(() => {
    if (!socket) return;
    const onStatus = ({ ready }: { ready: boolean }) => setReady(ready);
    const onReady = () => setReady(true);
    socket.on("media_engine_status", onStatus);
    socket.on("media_engine_ready", onReady);
    return () => {
      socket.off("media_engine_status", onStatus);
      socket.off("media_engine_ready", onReady);
    };
  }, [socket]);

  if (ready) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full bg-amber-500/90 px-4 py-2 text-sm font-medium text-black shadow-lg">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />
      Preparing media engine…
    </div>
  );
}
