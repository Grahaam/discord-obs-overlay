import { useCallback, useMemo, useRef, useState } from "react";
import { Circle, Lightbulb, RotateCcw } from "lucide-react";
import type { NormalizedPoint, Pose, UIConfig } from "../../types";
import { usePoses } from "../../hooks/usePoses";
import { usePoseLandmarks, type PoseFrame, type PoseLandmarksStatus } from "../../hooks/usePoseLandmarks";
import { usePoseRecorder } from "../../hooks/usePoseRecorder";
import { visiblePoses } from "../../lib/poseMedia";
import { scoreFrame } from "../../lib/poseScoring";
import { SIMILAR_WARN, similarity } from "../../lib/poseMatcher";
import PoseCard from "../poses/PoseCard";
import SkeletonCanvas from "../poses/SkeletonCanvas";
import { FieldLabel, Toggle, inputBase } from "../poses/fields";

interface Props {
  config: UIConfig;
  setConfig: React.Dispatch<React.SetStateAction<UIConfig>>;
  saveSettings: (next: UIConfig) => Promise<void>;
  t: any;
}

type RecordTarget = { kind: "new" } | { kind: "rerecord"; poseId: string };

function newPose(template: NormalizedPoint[], name: string): Pose {
  return {
    id: crypto.randomUUID(),
    name,
    kind: "custom",
    enabled: true,
    template,
    bodyParts: ["arms", "head"],
    threshold: 80,
    mirror: true,
    holdMs: 600,
    cooldownSeconds: 30,
    media: {
      type: "image",
      imageUrl: "",
      soundUrl: "",
      volume: 0.8,
      durationSeconds: 4,
      maxDurationSeconds: 30,
      fullscreen: true,
    },
  };
}

/** For each custom pose, the name of another one it looks too much like (they could trigger each other). */
function findLookAlikes(poses: Pose[]): Map<string, string> {
  const result = new Map<string, string>();
  const recorded = poses.filter((p) => p.kind === "custom" && p.template);
  for (const a of recorded) {
    const twin = recorded.find(
      (b) => b.id !== a.id && similarity(a.template!, b.template!, a.bodyParts) > SIMILAR_WARN
    );
    if (twin) result.set(a.id, twin.name);
  }
  return result;
}

const STATUS_LABEL: Record<PoseLandmarksStatus, string> = {
  idle: "statusIdle",
  loading: "statusLoading",
  ok: "",
  "no-obs": "statusNoObs",
  "no-source": "statusNoSource",
  error: "statusError",
  "hands-unavailable": "", // the dashboard only requests hands from Task 5, which adds its warning
};

export default function PosesTab({ config, setConfig, saveSettings, t }: Props) {
  const { file, update, flush, error } = usePoses();
  const labels: Record<string, string> = t.poses;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const targetRef = useRef<RecordTarget>({ kind: "new" });

  // usePoseRecorder always calls the latest version of this callback, so `file` is current
  const recorder = usePoseRecorder((template) => {
    const current = file;
    if (!template) return setRecordError(labels.recordFailed);
    if (!current) return;
    const target = targetRef.current;
    if (target.kind === "new") {
      const count = current.poses.filter((p) => p.kind === "custom").length;
      const pose = newPose(template, `${labels.myPose} ${count + 1}`);
      update({ ...current, poses: [...current.poses, pose] });
      setSelectedId(pose.id);
    } else {
      update({ ...current, poses: current.poses.map((p) => (p.id === target.poseId ? { ...p, template } : p)) });
    }
  });

  const sourceName = config.poseCameraSource?.trim() ?? "";
  const { feed } = recorder;
  const onFrame = useCallback((frame: PoseFrame) => feed(frame), [feed]);
  // Runs only while this tab is mounted, i.e. visible
  const { frame, status } = usePoseLandmarks({ active: !!sourceName, sourceName, onFrame });

  const visible = useMemo(() => (file ? visiblePoses(file) : []), [file]);
  const lookAlikes = useMemo(() => findLookAlikes(visible), [visible]);
  const scores = useMemo(() => {
    if (!frame) return null;
    return new Map(scoreFrame(visible, frame.landmarks, frame.aspect).map((s) => [s.poseId, s.score]));
  }, [visible, frame]);

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

  const record = (target: RecordTarget, bodyParts: Pose["bodyParts"]) => {
    setRecordError(null);
    targetRef.current = target;
    recorder.start(bodyParts);
  };

  const cameraReady = status === "ok";
  const ghost = visible.find((p) => p.id === selectedId)?.template;
  const statusText = !sourceName ? labels.statusIdle : STATUS_LABEL[status] ? labels[STATUS_LABEL[status]] : "";
  const recorderOverlay =
    recorder.phase.kind === "countdown" ? (
      <span className="text-7xl font-bold text-white drop-shadow-lg">{recorder.phase.seconds}</span>
    ) : recorder.phase.kind === "capturing" ? (
      <span className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-mono text-white">
        {labels.recording} {recorder.phase.good}/{recorder.phase.needed}
      </span>
    ) : statusText ? (
      <span className="max-w-xs px-4 text-center text-xs font-mono text-white/50">{statusText}</span>
    ) : cameraReady && !frame?.landmarks ? (
      <span className="rounded bg-black/60 px-2 py-1 text-[10px] font-mono text-white/60">{labels.noPerson}</span>
    ) : null;

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

      <div className="flex flex-col gap-2">
        <SkeletonCanvas frame={frame} ghost={ghost} overlay={recorderOverlay} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!cameraReady || recorder.busy}
            onClick={() => record({ kind: "new" }, ["arms", "head"])}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <Circle className="w-3 h-3 fill-red-400 text-red-400" />
            {labels.newPose}
          </button>
          <span className="text-[10px] font-mono text-white/30">{labels.recordHelp}</span>
        </div>
        {recordError && <span className="text-[10px] font-mono text-red-300">{recordError}</span>}
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
            onOpenChange={(open) => setSelectedId(open ? pose.id : null)}
            onRecord={
              pose.kind === "custom" ? () => record({ kind: "rerecord", poseId: pose.id }, pose.bodyParts) : undefined
            }
            recordDisabled={!cameraReady || recorder.busy}
            liveScore={scores ? (scores.get(pose.id) ?? null) : undefined}
            similarTo={lookAlikes.get(pose.id)}
            labels={labels}
          />
        ))}
      </div>

      {file.hiddenBuiltins.length > 0 && (
        <button
          type="button"
          onClick={() => update({ ...file, hiddenBuiltins: [] })}
          className="self-start flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono text-white/50 hover:text-white"
        >
          <RotateCcw className="w-3 h-3" />
          {labels.restore}
        </button>
      )}

      <div className="flex gap-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
        <Lightbulb className="w-3.5 h-3.5 shrink-0 text-white/30" />
        <ul className="flex flex-col gap-1 text-[10px] font-mono text-white/35 leading-relaxed">
          <li>{labels.tip2d}</li>
          <li>{labels.tipOnePerson}</li>
          <li>{labels.tipLight}</li>
        </ul>
      </div>
    </div>
  );
}
