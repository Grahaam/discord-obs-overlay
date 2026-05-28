import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { AlertPayload } from "../types";

interface UseOverlaySocketOptions {
  onSkip: () => void;
  activeAlertRef: React.MutableRefObject<AlertPayload | null>;
}

interface UseOverlaySocketReturn {
  queue: AlertPayload[];
  setQueue: React.Dispatch<React.SetStateAction<AlertPayload[]>>;
  queueRef: React.MutableRefObject<AlertPayload[]>;
  wsStatus: "connected" | "connecting" | "disconnected";
  socketRef: React.MutableRefObject<Socket | null>;
}

export function useOverlaySocket({
  onSkip,
  activeAlertRef,
}: UseOverlaySocketOptions): UseOverlaySocketReturn {
  const [queue, setQueue] = useState<AlertPayload[]>([]);
  const queueRef = useRef<AlertPayload[]>([]);
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">(
    "connecting"
  );
  const socketRef = useRef<Socket | null>(null);
  const onSkipRef = useRef(onSkip);

  // Keep queueRef in sync with state for the playback loop
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Keep onSkipRef current so the socket effect (mount-only) calls the latest handler
  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  // Socket connection — reconnect-safe with state reconciliation
  useEffect(() => {
    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setWsStatus("connected");
      console.log("[Overlay] Socket connected, requesting queue state");
      socket.emit("get_initial_state");
    });

    // On reconnect, merge server queue with local state — deduplicate by ID
    socket.on("initial_state", (serverQueue: AlertPayload[]) => {
      setQueue((prev) => {
        const knownIds = new Set([
          ...prev.map((a) => a.id),
          ...(activeAlertRef.current ? [activeAlertRef.current.id] : []),
        ]);
        const newItems = serverQueue.filter((a) => !knownIds.has(a.id));
        if (newItems.length > 0) {
          console.log(`[Overlay] Reconciled ${newItems.length} new item(s) from server`);
        }
        return [...prev, ...newItems];
      });
    });

    socket.on("disconnect", () => {
      setWsStatus("disconnected");
      console.log("[Overlay] Socket disconnected");
    });

    socket.on("connect_error", () => {
      setWsStatus("connecting");
    });

    // Heartbeat — update connection status, no queue action needed (handled via initial_state on reconnect)
    socket.on("heartbeat", (_data: { ts: number; queueSize: number }) => {
      // Presence of heartbeat confirms server is alive
    });

    socket.on("new_alert", (alert: AlertPayload) => {
      setQueue((prev) => {
        if (prev.some((item) => item.id === alert.id)) return prev;
        if (activeAlertRef.current?.id === alert.id) return prev;
        return [...prev, alert];
      });
    });

    socket.on("force_queue_update", (newQueue: AlertPayload[]) => {
      setQueue(newQueue);
    });

    socket.on("remove_queue_item", (itemId: string) => {
      setQueue((prev) => prev.filter((item) => item.id !== itemId));
    });

    socket.on("clear_queue", () => {
      setQueue([]);
    });

    socket.on("skip_alert", () => {
      console.log("[Overlay] Skip requested");
      onSkipRef.current();
    });

    return () => {
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { queue, setQueue, queueRef, wsStatus, socketRef };
}
