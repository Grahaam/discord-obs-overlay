import { useRef, useState } from "react";
import { Play, Upload } from "lucide-react";
import type { PoseMedia } from "../../types";
import { FieldLabel, NumberField, Toggle, inputBase } from "./fields";

type UrlField = "imageUrl" | "soundUrl" | "videoUrl";

const ACCEPT: Record<UrlField, string> = {
  imageUrl: "image/png,image/jpeg,image/gif,image/webp",
  soundUrl: "audio/mpeg,audio/wav,audio/ogg",
  videoUrl: "video/mp4,video/webm",
};

interface Props {
  media: PoseMedia;
  onChange: (media: PoseMedia) => void;
  labels: Record<string, string>;
}

/** Uploads one file to user-assets/ and returns its URL, or a localized error. */
async function uploadAsset(file: File, labels: Record<string, string>): Promise<{ url?: string; error?: string }> {
  try {
    const response = await fetch("/api/user-assets", {
      method: "POST",
      headers: { "X-Filename": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (response.ok) return { url: ((await response.json()) as { url: string }).url };
    if (response.status === 413) return { error: labels.uploadErrorSize };
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      error:
        body?.error === "size"
          ? labels.uploadErrorSize
          : body?.error === "type"
            ? labels.uploadErrorType
            : labels.uploadError,
    };
  } catch {
    return { error: labels.uploadError };
  }
}

function UrlWithUpload({
  field,
  label,
  value,
  onChange,
  labels,
}: {
  field: UrlField;
  label: string;
  value: string;
  onChange: (url: string) => void;
  labels: Record<string, string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadAsset(file, labels);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (result.url) onChange(result.url);
    else setError(result.error ?? labels.uploadError);
  };

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2 items-center">
        {value && field === "imageUrl" && (
          <img src={value} alt="" className="w-9 h-9 rounded object-cover border border-white/10 shrink-0" />
        )}
        {value && field === "videoUrl" && (
          <video src={value} muted className="w-9 h-9 rounded object-cover border border-white/10 shrink-0" />
        )}
        <input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={labels.urlPlaceholder}
          className={inputBase}
        />
        {value && field === "soundUrl" && (
          <button
            type="button"
            title={labels.playSound}
            onClick={() => new Audio(value).play().catch(() => {})}
            className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white shrink-0"
          >
            <Play className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-[10px] font-mono text-white/60 hover:text-white disabled:opacity-40 shrink-0"
        >
          <Upload className="w-3 h-3" />
          {busy ? labels.uploading : labels.chooseFile}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[field]}
          className="hidden"
          data-testid={`upload-${field}`}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {error && <span className="text-[10px] font-mono text-red-300">{error}</span>}
    </div>
  );
}

export default function PoseMediaEditor({ media, onChange, labels }: Props) {
  const set = (patch: Partial<PoseMedia>) => onChange({ ...media, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <FieldLabel>{labels.type}</FieldLabel>
        {/* Switching type keeps the other type's URLs, so flipping back loses nothing */}
        <select
          value={media.type}
          onChange={(e) => set({ type: e.target.value as PoseMedia["type"] })}
          className={inputBase}
        >
          <option value="image">{labels.typeImage}</option>
          <option value="video">{labels.typeVideo}</option>
        </select>
      </label>

      {media.type === "image" ? (
        <>
          <UrlWithUpload
            field="imageUrl"
            label={labels.image}
            value={media.imageUrl ?? ""}
            onChange={(imageUrl) => set({ imageUrl })}
            labels={labels}
          />
          <UrlWithUpload
            field="soundUrl"
            label={labels.sound}
            value={media.soundUrl ?? ""}
            onChange={(soundUrl) => set({ soundUrl })}
            labels={labels}
          />
        </>
      ) : (
        <UrlWithUpload
          field="videoUrl"
          label={labels.video}
          value={media.videoUrl ?? ""}
          onChange={(videoUrl) => set({ videoUrl })}
          labels={labels}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label={labels.volume}
          value={media.volume}
          min={0}
          max={1}
          step={0.1}
          onCommit={(volume) => set({ volume })}
        />
        {media.type === "image" && !media.soundUrl && (
          <NumberField
            label={labels.duration}
            value={media.durationSeconds ?? 4}
            min={1}
            max={120}
            onCommit={(durationSeconds) => set({ durationSeconds })}
          />
        )}
        <NumberField
          label={labels.max}
          value={media.maxDurationSeconds}
          min={5}
          max={120}
          onCommit={(maxDurationSeconds) => set({ maxDurationSeconds })}
        />
      </div>

      <Toggle checked={media.fullscreen} onChange={(fullscreen) => set({ fullscreen })} label={labels.fullscreen} />
    </div>
  );
}
