import { Plus, RotateCcw } from "lucide-react";
import type { Pose, UIConfig } from "../../types";
import { usePoses } from "../../hooks/usePoses";
import PoseCard from "../poses/PoseCard";
import { FieldLabel, Toggle, inputBase } from "../poses/fields";

interface Props {
  config: UIConfig;
  setConfig: React.Dispatch<React.SetStateAction<UIConfig>>;
  saveSettings: (next: UIConfig) => Promise<void>;
  t: any;
}

export default function PosesTab({ config, setConfig, saveSettings, t }: Props) {
  const { file, update, flush, error } = usePoses();
  const labels: Record<string, string> = t.poses;

  if (!file) {
    return <div className="text-xs font-mono text-white/40">{error ?? labels.loading}</div>;
  }

  // Global settings (master switch, camera) stay in settings.json, saved right away
  const updateSettings = (patch: Partial<UIConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    void saveSettings(next);
  };

  const replacePose = (pose: Pose) => update({ ...file, poses: file.poses.map((p) => (p.id === pose.id ? pose : p)) });

  // Built-in poses are only hidden so "Restore" can bring them back; custom ones are removed
  const deletePose = (pose: Pose) =>
    pose.builtinId
      ? update({ ...file, hiddenBuiltins: [...new Set([...file.hiddenBuiltins, pose.builtinId])] })
      : update({ ...file, poses: file.poses.filter((p) => p.id !== pose.id) });

  const preview = async (pose: Pose): Promise<string | null> => {
    await flush(); // the server must know the media just edited
    const response = await fetch(`/api/poses/${encodeURIComponent(pose.id)}/preview`, { method: "POST" }).catch(
      () => null
    );
    return response?.ok ? null : labels.previewBusy;
  };

  const visible = file.poses.filter((p) => !p.builtinId || !file.hiddenBuiltins.includes(p.builtinId));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{labels.title}</label>
        <Toggle
          checked={config.poseDetectionEnabled || false}
          onChange={(poseDetectionEnabled) => updateSettings({ poseDetectionEnabled })}
          label={labels.enabled}
        />
        <label className="flex flex-col gap-1">
          <FieldLabel>{labels.source}</FieldLabel>
          <input
            value={config.poseCameraSource || ""}
            placeholder={labels.sourcePlaceholder}
            onChange={(e) => setConfig({ ...config, poseCameraSource: e.target.value })}
            onBlur={(e) => updateSettings({ poseCameraSource: e.target.value.trim() })}
            className={inputBase}
          />
          <span className="text-[10px] font-mono text-white/25 leading-relaxed">{labels.help}</span>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] font-mono text-red-300">
          {labels.saveError} {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((pose) => (
          <PoseCard
            key={pose.id}
            pose={pose}
            onChange={replacePose}
            onDelete={() => deletePose(pose)}
            onPreview={() => preview(pose)}
            labels={labels}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title={labels.newDisabled}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[10px] font-mono text-white/30"
        >
          <Plus className="w-3 h-3" />
          {labels.newPose}
        </button>
        {file.hiddenBuiltins.length > 0 && (
          <button
            type="button"
            onClick={() => update({ ...file, hiddenBuiltins: [] })}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono text-white/50 hover:text-white"
          >
            <RotateCcw className="w-3 h-3" />
            {labels.restore}
          </button>
        )}
      </div>
    </div>
  );
}
