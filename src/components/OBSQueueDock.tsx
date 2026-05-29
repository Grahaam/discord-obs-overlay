import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { GripVertical, X, SkipForward, Trash2 } from "lucide-react";
import { AlertPayload } from "../types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableQueueItem({
  item,
  onRemove,
}: {
  item: AlertPayload;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white/5 p-2 rounded flex items-center gap-2">
      <button
        {...attributes}
        {...listeners}
        className="text-white/30 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="flex-1 truncate">
        <div className="text-white text-[10px] font-bold truncate">{item.title || item.authorName}</div>
        {item.title && <div className="text-white/40 text-[9px] truncate">{item.authorName}</div>}
      </div>
      <button onClick={() => onRemove(item.id)} className="text-red-400">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function OBSQueueDock() {
  const [queue, setQueue] = useState<AlertPayload[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      socket.emit("get_initial_state");
    });

    socket.on("initial_state", setQueue);
    socket.on("force_queue_update", setQueue);
    socket.on("new_alert", (alert: AlertPayload) => setQueue((prev) => [...prev, alert]));
    socket.on("remove_queue_item", (itemId: string) =>
      setQueue((prev) => prev.filter((i) => i.id !== itemId))
    );
    socket.on("clear_queue", () => setQueue([]));

    return () => {
      socket.close();
    };
  }, []);

  const handleAction = async (endpoint: string, body?: unknown) => {
    await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((item) => item.id === active.id);
    const newIndex = queue.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(queue, oldIndex, newIndex);

    setQueue(reordered);
    handleAction("queue/force-update", { queue: reordered.map((item) => ({ id: item.id })) });
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
        <button
          onClick={() => handleAction("queue/clear")}
          className="bg-red-900/30 hover:bg-red-900/50 p-2 rounded"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={queue.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {queue.map((item) => (
              <SortableQueueItem
                key={item.id}
                item={item}
                onRemove={(id) => handleAction("queue/remove-item", { id })}
              />
            ))}
            {queue.length === 0 && <div className="text-center text-white/20 py-8">Queue Empty</div>}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
