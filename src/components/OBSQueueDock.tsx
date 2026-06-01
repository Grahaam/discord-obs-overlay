import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SkipForward, Trash2, Play } from "lucide-react";
import { AlertPayload } from "../types";
import { useQueueSocket } from "../hooks/useQueueSocket";
import { SortableQueueItem } from "./SortableQueueItem";

export default function OBSQueueDock() {
  const { queue, nowPlaying, setQueue } = useQueueSocket();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
    const oldIndex = queue.findIndex((i) => i.id === active.id);
    const newIndex = queue.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(queue, oldIndex, newIndex);
    setQueue(reordered);
    handleAction("queue/force-update", { queue: reordered.map((i: AlertPayload) => ({ id: i.id })) });
  };

  return (
    <div className="bg-[#07070c] text-white min-h-screen flex flex-col font-sans select-none text-xs">
      {/* ── Controls ── */}
      <div className="flex gap-1.5 p-2.5 border-b border-white/[0.06] bg-[#0a0a12]">
        <button
          onClick={() => handleAction("skip-alert")}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold text-[11px] transition-all shadow-[0_0_10px_rgba(99,102,241,0.3)]"
        >
          <SkipForward className="w-3 h-3" /> Skip
        </button>
        <button
          onClick={() => handleAction("queue/clear")}
          className="bg-white/[0.05] hover:bg-red-900/30 active:scale-95 p-2 rounded-lg transition-all"
          title="Vider la file"
        >
          <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-red-400" />
        </button>
      </div>

      {/* ── Now playing ── */}
      {nowPlaying && (
        <div className="px-3 py-2 border-b border-indigo-500/20 bg-indigo-950/20 flex items-center gap-2">
          <Play className="w-2.5 h-2.5 text-indigo-400 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="text-indigo-200 text-[9px] font-bold uppercase tracking-widest mb-0.5">En cours</div>
            <div className="text-white/80 text-[10px] font-semibold truncate">
              {nowPlaying.title || nowPlaying.text || nowPlaying.authorName}
            </div>
            <div className="text-white/30 text-[9px] font-mono truncate">{nowPlaying.authorName}</div>
          </div>
        </div>
      )}

      {/* ── Queue header ── */}
      <div className="px-3 py-1.5 border-b border-white/[0.05] flex items-center gap-2">
        <span className="text-[9px] font-bold text-white/15 uppercase tracking-widest">File d&apos;attente</span>
        {queue.length > 0 && (
          <span className="ml-auto bg-indigo-600/20 text-indigo-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {queue.length}
          </span>
        )}
      </div>

      {/* ── Queue list ── */}
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <SkipForward className="w-5 h-5 text-white/10" />
            <span className="text-[10px] text-white/15">File vide</span>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={queue.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {queue.map((item) => (
                <SortableQueueItem
                  key={item.id}
                  item={item}
                  compact
                  onRemove={(id) => handleAction("queue/remove-item", { id })}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}