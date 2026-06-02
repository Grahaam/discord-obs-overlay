import { GripVertical, X, Image, Video, Link, Music } from "lucide-react";
import { AlertPayload, MediaType } from "../types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TYPE_ICON: Record<MediaType, React.ReactNode> = {
  image: <Image className="w-2.5 h-2.5" />,
  video: <Video className="w-2.5 h-2.5" />,
  audio: <Music className="w-2.5 h-2.5" />,
  iframe: <Link className="w-2.5 h-2.5" />,
  link: <Link className="w-2.5 h-2.5" />,
};

export function SortableQueueItem({
  item,
  onRemove,
  compact = false,
}: {
  item: AlertPayload;
  onRemove: (id: string) => void;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (compact) {
    return (
      <div ref={setNodeRef} style={style} className="bg-white/5 p-2 rounded flex items-center gap-2">
        <button {...attributes} {...listeners} className="text-white/30 cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="w-3 h-3" />
        </button>
        <span className="shrink-0 text-white/20">{TYPE_ICON[item.type]}</span>
        <div className="flex-1 truncate">
          <div className="text-white text-[10px] font-bold truncate">{item.title || item.authorName}</div>
          {item.title && <div className="text-white/40 text-[9px] truncate">{item.authorName}</div>}
        </div>
        <button onClick={() => onRemove(item.id)} className="text-white/20 hover:text-red-400 transition">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.05] px-3 py-2 rounded-xl flex items-center gap-2 text-xs transition"
    >
      <button {...attributes} {...listeners} className="text-white/30 cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="shrink-0 text-white/20">{TYPE_ICON[item.type]}</span>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-white/90 truncate block">{item.title || item.authorName}</span>
        {item.text && <span className="text-white/35 text-[10px] truncate block">{item.text}</span>}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="shrink-0 text-white/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
