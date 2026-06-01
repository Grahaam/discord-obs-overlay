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

  // Playback control callbacks
  onSkip?: () => void;
  onPause?: () => void;
  onResume?: () => void;

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
    const knownIds = new Set([...state.queue.map((a) => a.id), ...(state.nowPlaying ? [state.nowPlaying.id] : [])]);
    const newItems = serverQueue.filter((a) => !knownIds.has(a.id));
    const merged = [...state.queue, ...newItems];
    queueRef.current = merged;
    set({ queue: merged });
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
    const state = useQueueStore.getState();
    state.onSkip?.();
  });

  socketInstance.on("pause_alert", () => {
    const state = useQueueStore.getState();
    state.onPause?.();
  });

  socketInstance.on("resume_alert", () => {
    const state = useQueueStore.getState();
    state.onResume?.();
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
    onSkip: undefined,
    onPause: undefined,
    onResume: undefined,

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
        // Trigger state reconciliation to sync with server
        get().ensureSocketConnected();
        throw error; // Let caller decide what to do
      }
    },

    ensureSocketConnected: () => {
      initializeSocket(set);
    },

    setSkipCallback: (cb: () => void) => set({ onSkip: cb }),
    setPauseCallback: (cb: () => void) => set({ onPause: cb }),
    setResumeCallback: (cb: () => void) => set({ onResume: cb }),
  };
});

export function initQueueSocket() {
  useQueueStore.getState().ensureSocketConnected();
}
