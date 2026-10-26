import { GripVertical, X, Image, Video, Link, Music } from "lucide-react";
import { AlertPayload, MediaType } from "../types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TYPE_ICON: Record<MediaType, React.ReactNode> = {
  image: <Image className="w-2.5 h-2.5" aria-hidden />,
  video: <Video className="w-2.5 h-2.5" aria-hidden />,
  audio: <Music className="w-2.5 h-2.5" aria-hidden />,
  iframe: <Link className="w-2.5 h-2.5" aria-hidden />,
  link: <Link className="w-2.5 h-2.5" aria-hidden />,
};

export function SortableQueueItem({
  item,
  onRemove,
  compact = false,
  dragLabel = "Move",
  removeLabel = "Remove",
}: {
  item: AlertPayload;
  onRemove: (id: string) => void;
  compact?: boolean;
  dragLabel?: string;
  removeLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const name = item.title || item.authorName;

  if (compact) {
    // OBS dock is always dark: keep its fixed palette
    return (
      <div ref={setNodeRef} style={style} className="bg-white/5 p-2 rounded flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${dragLabel}: ${name}`}
          className="text-white/30 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-3 h-3" aria-hidden />
        </button>
        <span className="shrink-0 text-white/20">{TYPE_ICON[item.type]}</span>
        <div className="flex-1 truncate">
          <div className="text-white text-[10px] font-bold truncate">{name}</div>
          {item.title && <div className="text-white/40 text-[9px] truncate">{item.authorName}</div>}
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`${removeLabel}: ${name}`}
          className="text-white/20 hover:text-red-400 transition"
        >
          <X className="w-3 h-3" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group bg-surface-hover border border-line px-3 py-2 rounded-control flex items-center gap-2 text-xs transition"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`${dragLabel}: ${name}`}
        className="text-fg-subtle hover:text-fg cursor-grab active:cursor-grabbing touch-none focus-ring rounded"
      >
        <GripVertical className="w-4 h-4" aria-hidden />
      </button>
      <span className="shrink-0 text-fg-subtle">{TYPE_ICON[item.type]}</span>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-fg truncate block">{name}</span>
        {item.text && <span className="text-fg-muted text-[11px] truncate block">{item.text}</span>}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`${removeLabel}: ${name}`}
        className="shrink-0 text-fg-subtle hover:text-danger-text transition focus-ring rounded"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </li>
  );
}
