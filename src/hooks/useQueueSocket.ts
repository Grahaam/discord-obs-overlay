import { useState, useEffect } from "react";
import { createSocket } from "../lib/createSocket";
import { AlertPayload } from "../types";

export function useQueueSocket(): {
  queue: AlertPayload[];
  nowPlaying: AlertPayload | null;
  setQueue: React.Dispatch<React.SetStateAction<AlertPayload[]>>;
} {
  const [queue, setQueue] = useState<AlertPayload[]>([]);
  const [nowPlaying, setNowPlaying] = useState<AlertPayload | null>(null);

  useEffect(() => {
    const socket = createSocket();

    socket.on("connect", () => socket.emit("get_initial_state"));
    socket.on("initial_state", setQueue);
    socket.on("force_queue_update", setQueue);
    // TODO(human): add new_alert dedup handler (3 lines)
    socket.on("new_alert", (alert: AlertPayload) => {
      setQueue((prev) => {
        if (prev.some((a) => a.id === alert.id)) {
          return prev;
        }
        return [...prev, alert];
      });
    });
    socket.on("remove_queue_item", (id: string) => setQueue((prev) => prev.filter((i) => i.id !== id)));
    socket.on("clear_queue", () => setQueue([]));
    socket.on("now_playing", (alert: AlertPayload | null) => setNowPlaying(alert));

    // TODO(human): return socket cleanup function (1 line)
    return () => {
      socket.disconnect();
    };
  }, []);

  return { queue, nowPlaying, setQueue };
}
