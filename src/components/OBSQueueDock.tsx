import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { GripVertical, X, SkipForward, Trash2 } from "lucide-react";
import { AlertPayload } from "../types";

export default function OBSQueueDock() {
  const [queue, setQueue] = useState<AlertPayload[]>([]);

  useEffect(() => {
    const socket = io(window.location.origin);
    socket.on("initial_state", setQueue);
    socket.on("force_queue_update", setQueue);
    socket.on("new_alert", (alert) => setQueue((prev) => [...prev, alert]));
    socket.on("remove_queue_item", (itemId) => setQueue((prev) => prev.filter((i) => i.id !== itemId)));
    socket.on("clear_queue", () => setQueue([]));
    return () => {
      socket.close();
    };
  }, []);

  const handleAction = async (endpoint: string, body?: any) => {
    await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  return (
    <div className="bg-[#0a0a0f] text-white min-h-screen p-3 font-sans text-xs">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => handleAction("skip-alert")}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-2 rounded flex items-center justify-center gap-1"
        >
          <SkipForward className="w-3 h-3" /> Skip
        </button>
        <button onClick={() => handleAction("queue/clear")} className="bg-red-900/30 hover:bg-red-900/50 p-2 rounded">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-1">
        {queue.map((item) => (
          <div key={item.id} className="bg-white/5 p-2 rounded flex items-center gap-2">
            <GripVertical className="w-3 h-3 text-white/30" />
            <div className="flex-1 truncate">
              <div className="text-white text-[10px] font-bold truncate">{item.title || item.authorName}</div>
              {item.title && <div className="text-white/40 text-[9px] truncate">{item.authorName}</div>}
            </div>
            <button onClick={() => handleAction("queue/remove-item", { id: item.id })} className="text-red-400">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {queue.length === 0 && <div className="text-center text-white/20 py-8">Queue Empty</div>}
      </div>
    </div>
  );
}
