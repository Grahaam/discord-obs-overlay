import { useRef, useState } from "react";
import { Play, Upload } from "lucide-react";
import type { PoseMedia } from "../../types";
import { Button, Field, inputClass } from "../../ui";
import { NumberField, Toggle } from "./fields";

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
    <Field label={label} error={error}>
      {(aria) => (
        <div className="flex gap-2 items-center">
          {value && field === "imageUrl" && (
            <img src={value} alt="" className="w-9 h-9 rounded-control object-cover border border-line shrink-0" />
          )}
          {value && field === "videoUrl" && (
            <video src={value} muted className="w-9 h-9 rounded-control object-cover border border-line shrink-0" />
          )}
          <input
            {...aria}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={labels.urlPlaceholder}
            className={inputClass}
          />
          {value && field === "soundUrl" && (
            <Button
              variant="ghost"
              title={labels.playSound}
              aria-label={labels.playSound}
              onClick={() => new Audio(value).play().catch(() => {})}
              className="shrink-0"
            >
              <Play aria-hidden className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button disabled={busy} onClick={() => inputRef.current?.click()} className="shrink-0">
            <Upload aria-hidden className="w-3.5 h-3.5" />
            {busy ? labels.uploading : labels.chooseFile}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT[field]}
            className="hidden"
            tabIndex={-1}
            aria-hidden
            data-testid={`upload-${field}`}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>
      )}
    </Field>
  );
}

export default function PoseMediaEditor({ media, onChange, labels }: Props) {
  const set = (patch: Partial<PoseMedia>) => onChange({ ...media, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <Field label={labels.type}>
        {(aria) => (
          /* Switching type keeps the other type's URLs, so flipping back loses nothing */
          <select
            {...aria}
            value={media.type}
            onChange={(e) => set({ type: e.target.value as PoseMedia["type"] })}
            className={inputClass}
          >
            <option value="image">{labels.typeImage}</option>
            <option value="video">{labels.typeVideo}</option>
          </select>
        )}
      </Field>

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
