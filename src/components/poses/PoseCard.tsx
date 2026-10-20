import { useState } from "react";
import { AlertTriangle, ChevronDown, Circle, Eye, Trash2 } from "lucide-react";
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
  onOpenChange: (open: boolean) => void;
  /** Re-records the template (custom poses only) */
  onRecord?: () => void;
  recordDisabled: boolean;
  /** Live match % from the dashboard camera; undefined while the camera is off */
  liveScore?: number | null;
  /** Name of another pose this one looks too much like */
  similarTo?: string;
  labels: Record<string, string>;
}

function MatchBar({ score, threshold, label }: { score: number | null; threshold: number; label: string }) {
  const value = Math.round(score ?? 0);
  const matched = score !== null && score >= threshold;
  return (
    <div className="flex items-center gap-2 w-28 shrink-0" title={`${label}: ${score === null ? "–" : `${value} %`}`}>
      <div className="relative h-1.5 flex-1 rounded bg-white/[0.06] overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 transition-all ${matched ? "bg-emerald-400" : "bg-white/25"}`}
          style={{ width: `${value}%` }}
        />
        {/* Threshold marker */}
        <div className="absolute inset-y-0 w-px bg-violet-300/70" style={{ left: `${threshold}%` }} />
      </div>
      <span className={`text-[10px] font-mono w-8 text-right ${matched ? "text-emerald-300" : "text-white/35"}`}>
        {score === null ? "–" : `${value}%`}
      </span>
    </div>
  );
}

export default function PoseCard({
  pose,
  onChange,
  onDelete,
  onPreview,
  onOpenChange,
  onRecord,
  recordDisabled,
  liveScore,
  similarTo,
  labels,
}: Props) {
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
          onClick={() => {
            setOpen(!open);
            onOpenChange(!open);
          }}
          aria-expanded={open}
          className="flex-1 flex items-center gap-2 text-left text-sm font-semibold text-white/80"
        >
          {pose.name}
          <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {liveScore !== undefined && (
          <MatchBar score={liveScore} threshold={pose.kind === "builtin" ? 100 : pose.threshold} label={labels.match} />
        )}
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

      {similarTo && (
        <div className="flex items-center gap-2 px-4 pb-3 -mt-1 text-[10px] font-mono text-amber-300/80">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {labels.tooSimilar.replace("{name}", similarTo)}
        </div>
      )}

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
              {onRecord && (
                <button
                  type="button"
                  disabled={recordDisabled}
                  onClick={onRecord}
                  className="self-start flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono text-white/60 hover:text-white disabled:opacity-40"
                >
                  <Circle className="w-3 h-3 fill-red-400 text-red-400" />
                  {labels.rerecord}
                </button>
              )}
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
