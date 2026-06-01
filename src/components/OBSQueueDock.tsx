import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SkipForward, Trash2, Play, Pause, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "../store/queueStore";
import { SortableQueueItem } from "./SortableQueueItem";

export default function OBSQueueDock() {
  const { queue, nowPlaying, reorder } = useQueueStore();
  const playback = useQueueStore((s) => s.playback);
  const volumeTimerRef = useRef<number | null>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const [scrubDisplayTime, setScrubDisplayTime] = useState(0);

  // Tracks the last currentTime we accepted — used to reject stale streams from a second overlay.
  // Two overlay instances (OBS + browser tab) each emit playback_state independently; their
  // streams interleave at the dock. We accept an update only when it's within 2s of the last
  // accepted value (normal 500ms cadence) or within 1.5s of a commanded seek target.
  const acceptedTimeRef = useRef<number>(0);
  const seekTargetRef = useRef<number | null>(null);

  // Reset convergence state when a new alert starts (currentTime restarts at 0)
  useEffect(() => {
    acceptedTimeRef.current = 0;
    seekTargetRef.current = null;
  }, [nowPlaying]);

  // Imperatively sync scrubber position from socket — skip while user is dragging
  useEffect(() => {
    const t = playback?.currentTime ?? 0;
    if (isDraggingRef.current) return;

    const target = seekTargetRef.current;
    const drift = Math.abs(t - acceptedTimeRef.current);
    // Reject events far from last accepted position that don't match the seek target.
    if (drift > 2 && (target === null || Math.abs(t - target) >= 1.5)) return;

    acceptedTimeRef.current = t;
    if (scrubRef.current) scrubRef.current.value = String(t);
    setScrubDisplayTime(t);
  }, [playback?.currentTime]);

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = queue.findIndex((i) => i.id === active.id);
    const newIndex = queue.findIndex((i) => i.id === over.id);
    try {
      await reorder(oldIndex, newIndex);
    } catch (err) {
      console.error("Failed to reorder queue:", err);
    }
  };

  function formatTime(s: number) {
    if (!isFinite(s) || s <= 0) return "0:00";
    const sec = Math.floor(s % 60);
    const min = Math.floor(s / 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="bg-[#07070c] text-white h-full flex flex-col font-sans select-none text-xs">
      {/* ── Controls ── */}
      <div className="flex flex-col gap-2 px-2.5 pt-2.5 pb-2 border-b border-white/[0.06] bg-[#0a0a12]">
        {/* Button row */}
        <div className="flex items-center gap-1.5">
          {/* Seek -5s — YouTube-style */}
          <button
            type="button"
            onClick={() => handleAction("queue/seek", { seconds: -5 })}
            className="bg-white/[0.05] hover:bg-white/10 active:scale-95 p-1.5 rounded-md transition-all relative"
            title="-5s"
          >
            <RotateCcw className="w-5 h-5 text-white/50" />
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-white/70 translate-y-px">
              5
            </span>
          </button>

          {/* Pause / Resume */}
          <button
            type="button"
            onClick={() => handleAction(playback?.isPaused ? "queue/resume" : "queue/pause")}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 p-2 rounded-md flex items-center justify-center transition-all"
            title={playback?.isPaused ? "Resume" : "Pause"}
          >
            {playback?.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Seek +5s — YouTube-style */}
          <button
            type="button"
            onClick={() => handleAction("queue/seek", { seconds: 5 })}
            className="bg-white/[0.05] hover:bg-white/10 active:scale-95 p-1.5 rounded-md transition-all relative"
            title="+5s"
          >
            <RotateCw className="w-5 h-5 text-white/50" />
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-white/70 translate-y-px">
              5
            </span>
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5 shrink-0" />

          {/* Skip alert — distinct: filled indigo + SkipForward */}
          <button
            type="button"
            onClick={() => handleAction("skip-alert")}
            className="bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 active:scale-95 p-2 rounded-md transition-all"
            title="Passer l'alerte"
          >
            <SkipForward className="w-3.5 h-3.5 text-indigo-400" />
          </button>

          {/* Clear queue */}
          <button
            type="button"
            onClick={() => handleAction("queue/clear")}
            className="bg-white/[0.05] hover:bg-red-900/40 active:scale-95 p-2 rounded-md transition-all"
            title="Vider la file"
          >
            <Trash2 className="w-3.5 h-3.5 text-white/40" />
          </button>

          <div className="flex-1" />

          {/* Volume */}
          <input
            aria-label="Volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={typeof playback?.volume === "number" ? playback.volume : 1}
            onChange={(e) => {
              const v = parseFloat(e.currentTarget.value);
              if (volumeTimerRef.current) window.clearTimeout(volumeTimerRef.current);
              volumeTimerRef.current = window.setTimeout(() => {
                handleAction("queue/volume", { v });
              }, 150);
            }}
            className="w-20 accent-indigo-500"
          />
        </div>

        {/* Progress row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/35 tabular-nums w-8">{formatTime(scrubDisplayTime)}</span>
          <input
            ref={scrubRef}
            type="range"
            min={0}
            max={playback?.duration ?? 1}
            step={0.5}
            defaultValue={0}
            onPointerDown={() => {
              isDraggingRef.current = true;
            }}
            onInput={(e) => setScrubDisplayTime(parseFloat(e.currentTarget.value))}
            onPointerUp={(e) => {
              isDraggingRef.current = false;
              const seekTo = parseFloat(e.currentTarget.value);
              seekTargetRef.current = seekTo;
              acceptedTimeRef.current = seekTo;
              handleAction("queue/seek-absolute", { seconds: seekTo });
            }}
            className="flex-1 accent-indigo-500 h-1"
            aria-label="Seek"
          />
          <span className="text-[10px] text-white/35 tabular-nums w-8 text-right">
            {formatTime(playback?.duration ?? 0)}
          </span>
        </div>
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
