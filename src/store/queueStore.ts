import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { AlertPayload } from "../types";

interface QueueStoreState {
  queue: AlertPayload[];
  nowPlaying: AlertPayload | null;
  wsStatus: "connected" | "connecting" | "disconnected";
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
}

let socketInstance: Socket | null = null;
const queueRef = { current: [] as AlertPayload[] };
const socketRef = { current: null as Socket | null };

function initializeSocket(set: any) {
  if (socketInstance) return;

  socketInstance = io(window.location.origin, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socketRef.current = socketInstance;
  set({ wsStatus: "connecting" });

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
    const knownIds = new Set([
      ...state.queue.map((a) => a.id),
      ...(state.nowPlaying ? [state.nowPlaying.id] : []),
    ]);
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
}

export const useQueueStore = create<QueueStoreState>((set, get) => ({
  queue: [],
  nowPlaying: null,
  wsStatus: "disconnected",
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
    get().setQueue(queue);

    await fetch("/api/queue/force-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue: queue.map((i) => ({ id: i.id })) }),
    });
  },

  ensureSocketConnected: () => {
    initializeSocket(set);
  },
}));

export function initQueueSocket() {
  useQueueStore.getState().ensureSocketConnected();
}
