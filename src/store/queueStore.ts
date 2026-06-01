import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { AlertPayload } from "../types";

interface QueueStoreState {
  queue: AlertPayload[];
  nowPlaying: AlertPayload | null;
  wsStatus: "connected" | "connecting" | "disconnected";
  socket: Socket | null;
  queueRef: React.MutableRefObject<AlertPayload[]>;
  socketRef: React.MutableRefObject<Socket | null>;

  // Actions
  setQueue: (queue: AlertPayload[]) => void;
  setNowPlaying: (alert: AlertPayload | null) => void;
  removeQueueItem: (id: string) => void;
  clearQueue: () => void;
  addQueueItem: (alert: AlertPayload) => void;
  reorder: (fromIdx: number, toIdx: number) => Promise<void>;
  ensureSocketConnected: () => void;
  setSkipCallback: (cb: () => void) => void;
  setPauseCallback: (cb: () => void) => void;
  setResumeCallback: (cb: () => void) => void;
}

let socketInstance: Socket | null = null;
let socketInitialized = false;
const queueRef = { current: [] as AlertPayload[] };
const socketRef = { current: null as Socket | null };

let _onSkip: (() => void) | undefined;
let _onPause: (() => void) | undefined;
let _onResume: (() => void) | undefined;

function initializeSocket(set: any) {
  // Prevent double initialization
  if (socketInitialized) return;
  socketInitialized = true;

  socketInstance = io(window.location.origin, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socketRef.current = socketInstance;
  set({ socket: socketInstance, wsStatus: "connecting" });

  socketInstance.on("connect", () => {
    set({ wsStatus: "connected" });
    socketInstance!.emit("get_initial_state");
  });

  socketInstance.on("disconnect", () => {
    set({ wsStatus: "disconnected" });
  });

  socketInstance.on("connect_error", () => {
    set({ wsStatus: "connecting" });
  });

  socketInstance.on("initial_state", (serverQueue: AlertPayload[]) => {
    const state = useQueueStore.getState();
    // Server queue is authoritative for ordering.
    // Exclude only the currently-playing item: server still holds it pending alert_played,
    // but we've already dequeued it locally and are mid-playback.
    const playingId = state.nowPlaying?.id;
    const reconciled = playingId
      ? serverQueue.filter((a) => a.id !== playingId)
      : serverQueue;
    queueRef.current = reconciled;
    set({ queue: reconciled });
  });

  socketInstance.on("force_queue_update", (serverQueue: AlertPayload[]) => {
    queueRef.current = serverQueue;
    set({ queue: serverQueue });
  });

  socketInstance.on("new_alert", (alert: AlertPayload) => {
    const state = useQueueStore.getState();
    if (state.queue.some((a) => a.id === alert.id)) return;
    const newQueue = [...state.queue, alert];
    queueRef.current = newQueue;
    set({ queue: newQueue });
  });

  socketInstance.on("remove_queue_item", (id: string) => {
    const state = useQueueStore.getState();
    const newQueue = state.queue.filter((i) => i.id !== id);
    queueRef.current = newQueue;
    set({ queue: newQueue });
  });

  socketInstance.on("clear_queue", () => {
    queueRef.current = [];
    set({ queue: [] });
  });

  socketInstance.on("now_playing", (alert: AlertPayload | null) => {
    set({ nowPlaying: alert });
  });

  socketInstance.on("skip_alert", () => {
    _onSkip?.();
  });

  socketInstance.on("pause_alert", () => {
    _onPause?.();
  });

  socketInstance.on("resume_alert", () => {
    _onResume?.();
  });
}

export const useQueueStore = create<QueueStoreState>((set, get) => {
  // Auto-initialize socket on first store access (if in browser)
  if (typeof window !== "undefined" && !socketInitialized) {
    setTimeout(() => {
      const state = get();
      state.ensureSocketConnected();
    }, 0);
  }

  return {
    queue: [],
    nowPlaying: null,
    wsStatus: "disconnected",
    socket: null,
    queueRef,
    socketRef,

    setQueue: (queue: AlertPayload[]) => {
      queueRef.current = queue;
      set({ queue });
    },

    setNowPlaying: (alert: AlertPayload | null) => {
      set({ nowPlaying: alert });
    },

    removeQueueItem: (id: string) => {
      const queue = get().queue.filter((item) => item.id !== id);
      get().setQueue(queue);
    },

    clearQueue: () => {
      get().setQueue([]);
    },

    addQueueItem: (alert: AlertPayload) => {
      const queue = get().queue;
      if (queue.some((a) => a.id === alert.id)) return;
      get().setQueue([...queue, alert]);
    },

    reorder: async (fromIdx: number, toIdx: number) => {
      const queue = [...get().queue];
      const [item] = queue.splice(fromIdx, 1);
      queue.splice(toIdx, 0, item);
      get().setQueue(queue); // Optimistic update

      try {
        const response = await fetch("/api/queue/force-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queue: queue.map((i) => ({ id: i.id })) }),
        });
        if (!response.ok) {
          throw new Error(`Queue reorder failed: ${response.status}`);
        }
      } catch (error) {
        console.error("[QueueStore] Reorder API error:", error);
        // Re-request authoritative queue from server to roll back optimistic update
        socketInstance?.emit("get_initial_state");
        throw error;
      }
    },

    ensureSocketConnected: () => {
      initializeSocket(set);
    },

    setSkipCallback: (cb: () => void) => { _onSkip = cb; },
    setPauseCallback: (cb: () => void) => { _onPause = cb; },
    setResumeCallback: (cb: () => void) => { _onResume = cb; },
  };
});
