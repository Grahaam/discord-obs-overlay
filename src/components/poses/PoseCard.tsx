import { useState } from "react";
import { ChevronDown, Eye, Trash2 } from "lucide-react";
import type { BodyPart, Pose } from "../../types";
import { hasMedia } from "../../lib/poseMedia";
import PoseMediaEditor from "./PoseMediaEditor";
import { FieldLabel, NumberField, Toggle, inputBase } from "./fields";

const BODY_PARTS: BodyPart[] = ["arms", "legs", "head"];

interface Props {
  pose: Pose;
  onChange: (pose: Pose) => void;
  onDelete: () => void;
  onPreview: () => Promise<string | null>;
  labels: Record<string, string>;
}

export default function PoseCard({ pose, onChange, onDelete, onPreview, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null); // null while not editing
  const [previewError, setPreviewError] = useState<string | null>(null);

  const set = (patch: Partial<Pose>) => onChange({ ...pose, ...patch });
  // An empty name would fail validation: fall back to the previous one
  const commitName = () => {
    if (name === null) return;
    const next = name.trim() || pose.name;
    setName(null);
    if (next !== pose.name) set({ name: next });
  };
  const setPart = (part: BodyPart, checked: boolean) => {
    const bodyParts = checked ? [...pose.bodyParts, part] : pose.bodyParts.filter((p) => p !== part);
    if (bodyParts.length > 0) set({ bodyParts });
  };
  const preview = async () => {
    setPreviewError(null);
    setPreviewError(await onPreview());
  };

  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center gap-3 px-4 py-3">
        <Toggle checked={pose.enabled} onChange={(enabled) => set({ enabled })} ariaLabel={labels.poseEnabled} />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex-1 flex items-center gap-2 text-left text-sm font-semibold text-white/80"
        >
          {pose.name}
          <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {pose.kind === "builtin" && (
          <span className="rounded bg-violet-500/15 px-2 py-0.5 text-[10px] font-mono text-violet-300">
            {labels.builtin}
          </span>
        )}
        {!hasMedia(pose) && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono text-amber-300">
            {labels.needsMedia}
          </span>
        )}
        <button
          type="button"
          onClick={onDelete}
          title={labels.hide}
          aria-label={labels.hide}
          className="p-1.5 text-white/30 hover:text-red-300"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-white/[0.05] px-4 py-4">
          <label className="flex flex-col gap-1">
            <FieldLabel>{labels.name}</FieldLabel>
            <input
              value={name ?? pose.name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && commitName()}
              className={inputBase}
            />
          </label>

          {/* The built-in pose is matched by fixed rules: no template, parts, threshold or mirror */}
          {pose.kind === "custom" && (
            <>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>{labels.bodyParts}</FieldLabel>
                <div className="flex gap-4">
                  {BODY_PARTS.map((part) => (
                    <Toggle
                      key={part}
                      checked={pose.bodyParts.includes(part)}
                      onChange={(checked) => setPart(part, checked)}
                      label={labels[part]}
                    />
                  ))}
                </div>
              </div>
              <Toggle checked={pose.mirror} onChange={(mirror) => set({ mirror })} label={labels.mirror} />
            </>
          )}

          <div className="grid grid-cols-3 gap-2">
            {pose.kind === "custom" && (
              <NumberField
                label={labels.threshold}
                value={pose.threshold}
                min={0}
                max={100}
                onCommit={(threshold) => set({ threshold })}
              />
            )}
            <NumberField
              label={labels.hold}
              value={pose.holdMs}
              min={100}
              max={5000}
              step={100}
              onCommit={(holdMs) => set({ holdMs })}
            />
            <NumberField
              label={labels.cooldown}
              value={pose.cooldownSeconds}
              min={5}
              max={3600}
              onCommit={(cooldownSeconds) => set({ cooldownSeconds })}
            />
          </div>

          <PoseMediaEditor media={pose.media} onChange={(media) => set({ media })} labels={labels} />

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => void preview()}
              className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-2 text-xs font-semibold text-white"
            >
              <Eye className="w-3.5 h-3.5" />
              {labels.preview}
            </button>
            {previewError && <span className="text-[10px] font-mono text-red-300">{previewError}</span>}
          </div>
        </div>
      )}
    </article>
  );
}
