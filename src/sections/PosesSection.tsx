import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Lightbulb, RotateCcw } from "lucide-react";
import type { BodyPart, NormalizedPoint, Pose, UIConfig } from "../types";
import { usePoses } from "../hooks/usePoses";
import { usePoseLandmarks, type PoseFrame, type PoseLandmarksStatus } from "../hooks/usePoseLandmarks";
import { usePoseRecorder } from "../hooks/usePoseRecorder";
import { usePoseCalibration } from "../hooks/usePoseCalibration";
import { MAX_EXTRA_TEMPLATES, bodyTemplates, weakestJoint, type WeakJoint } from "../lib/poseCalibration";
import { visiblePoses } from "../lib/poseMedia";
import { posesNeedHands, scoreFrame } from "../lib/poseScoring";
import { fingerCurls, handsLookAlike } from "../lib/handMatcher";
import { mergeHandRecording, ticksToParts, type RecordPart, type RecordTicks } from "../lib/handRecording";
import { SIMILAR_WARN, normalise, similarity } from "../lib/poseMatcher";
import { useDashboard } from "../dashboard/DashboardContext";
import { Button, EmptyState, Field, SettingRow, Switch, inputClass } from "../ui";
import PoseCard from "../components/poses/PoseCard";
import RecordControls from "../components/poses/RecordControls";
import SkeletonCanvas from "../components/poses/SkeletonCanvas";

const RECORD_ERROR: Record<RecordPart, string> = {
  body: "recordFailed",
  leftHand: "missingLeftHand",
  rightHand: "missingRightHand",
};

type RecordTarget = { kind: "new" } | { kind: "rerecord"; poseId: string } | { kind: "example"; poseId: string };

function newPose(template: NormalizedPoint[] | null, hands: Pose["hands"], bodyParts: BodyPart[], name: string): Pose {
  return {
    id: crypto.randomUUID(),
    name,
    kind: "custom",
    enabled: true,
    ...(template ? { template } : {}),
    ...(hands ? { hands } : {}),
    bodyParts,
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
  const recorded = poses.filter((p) => p.kind === "custom" && (p.template || p.hands));
  for (const a of recorded) {
    const twin = recorded.find(
      (b) =>
        b.id !== a.id &&
        ((!!a.template && !!b.template && similarity(a.template, b.template, a.bodyParts) > SIMILAR_WARN) ||
          handsLookAlike(a, b))
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
  "no-picture": "statusNoPicture",
  error: "statusError",
  "hands-unavailable": "", // shown as a warning under the camera, the body still works
};

export default function PosesSection() {
  const { t, config, setConfig, saveNow } = useDashboard();
  const { file, update, flush, error } = usePoses();
  const labels = t.poses as Record<string, string>;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<RecordTicks>({ body: true, leftHand: false, rightHand: false });
  const targetRef = useRef<RecordTarget>({ kind: "new" });
  const partsRef = useRef<BodyPart[]>([]);

  // usePoseRecorder always calls the latest version of this callback, so `file` is current
  const recorder = usePoseRecorder(({ template, hands, error: missing }) => {
    const current = file;
    const target = targetRef.current;
    if (missing) {
      // A brand-new pose has no "old pose" to keep: those messages drop that sentence
      const key = target.kind === "new" ? `${RECORD_ERROR[missing]}New` : RECORD_ERROR[missing];
      return setRecordError(labels[key]);
    }
    if (!current) return;
    if (target.kind === "new") {
      const count = current.poses.filter((p) => p.kind === "custom").length;
      const pose = newPose(template, hands, partsRef.current, `${labels.myPose} ${count + 1}`);
      update({ ...current, poses: [...current.poses, pose] });
      setSelectedId(pose.id);
    } else if (target.kind === "example") {
      if (!template) return;
      update({
        ...current,
        poses: current.poses.map((p) =>
          p.id === target.poseId && (p.extraTemplates?.length ?? 0) < MAX_EXTRA_TEMPLATES
            ? { ...p, extraTemplates: [...(p.extraTemplates ?? []), template] }
            : p
        ),
      });
    } else {
      // Parts not recorded this time keep their old template; recorded ones become ticked
      const parts = partsRef.current;
      const result = { template, hands };
      update({
        ...current,
        poses: current.poses.map((p) => (p.id === target.poseId ? mergeHandRecording(p, result, parts) : p)),
      });
    }
  });

  const sourceName = config.poseCameraSource?.trim() ?? "";
  const visible = useMemo(() => (file ? visiblePoses(file) : []), [file]);
  const calibration = usePoseCalibration(
    (poseId, frame) => {
      const pose = visible.find((p) => p.id === poseId);
      return pose ? (scoreFrame([pose], frame.landmarks, frame.aspect, frame.hands)[0].score ?? null) : null;
    },
    (poseId) => visible.find((p) => p.id === poseId)?.threshold ?? 80
  );
  const { feed } = recorder;
  const feedCalibration = calibration.feed;
  const onFrame = useCallback(
    (frame: PoseFrame) => {
      // Dev only: lets real hand/body readings be copied out as test fixtures (window.__poseFrame)
      if (import.meta.env.DEV) (window as unknown as { __poseFrame?: PoseFrame }).__poseFrame = frame;
      feed(frame);
      feedCalibration(frame);
    },
    [feed, feedCalibration]
  );
  // Hands are read when a visible pose uses them (enabled or not, for the live chips) or a recording tick asks
  const posesHands = useMemo(() => posesNeedHands(visible.map((p) => ({ ...p, enabled: true }))), [visible]);
  const hands = { left: posesHands.left || ticks.leftHand, right: posesHands.right || ticks.rightHand };
  // Runs only while this tab is mounted, i.e. visible
  const { frame, status } = usePoseLandmarks({ active: !!sourceName, sourceName, onFrame, hands, delegate: "GPU" });

  const lookAlikes = useMemo(() => findLookAlikes(visible), [visible]);
  const scores = useMemo(() => {
    if (!frame) return null;
    return new Map(scoreFrame(visible, frame.landmarks, frame.aspect, frame.hands).map((s) => [s.poseId, s.score]));
  }, [visible, frame]);
  // Which joint is farthest from each custom pose: shown while the pose is not matching
  const weakJoints = useMemo(() => {
    const result = new Map<string, WeakJoint>();
    const live = frame?.landmarks && normalise(frame.landmarks, frame.aspect);
    if (!live) return result;
    for (const pose of visible) {
      const bodyParts = pose.bodyParts.filter((p) => p !== "leftHand" && p !== "rightHand");
      if (pose.kind !== "custom" || bodyParts.length === 0) continue;
      const weak = weakestJoint(live, bodyTemplates(pose), { bodyParts, mirror: pose.mirror });
      if (weak) result.set(pose.id, weak);
    }
    return result;
  }, [visible, frame]);
  const liveCurls = useMemo(
    () => ({
      left: frame?.hands?.left && fingerCurls(frame.hands.left.points),
      right: frame?.hands?.right && fingerCurls(frame.hands.right.points),
    }),
    [frame]
  );

  if (!file) {
    return (
      <div role="status" className="text-sm text-fg-muted">
        {error ?? labels.loading}
      </div>
    );
  }

  // Global settings (master switch, camera) stay in settings.json, saved right away
  const updateSettings = (patch: Partial<UIConfig>) => {
    void saveNow({ ...config, ...patch });
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
    partsRef.current = bodyParts;
    recorder.start(bodyParts);
  };

  const cameraReady = status === "ok" || status === "hands-unavailable";
  const selected = visible.find((p) => p.id === selectedId);
  const statusText = !sourceName ? labels.statusIdle : STATUS_LABEL[status] ? labels[STATUS_LABEL[status]] : "";
  const recorderOverlay =
    recorder.phase.kind === "countdown" ? (
      <span className="text-7xl font-bold text-white drop-shadow-lg">{recorder.phase.seconds}</span>
    ) : recorder.phase.kind === "capturing" ? (
      <span className="rounded-control bg-danger px-3 py-1.5 text-sm font-semibold text-white">
        {labels.recording} {recorder.phase.good}/{recorder.phase.needed}
      </span>
    ) : statusText ? (
      <span className="max-w-xs px-4 text-center text-sm text-white/80">{statusText}</span>
    ) : cameraReady && !frame?.landmarks ? (
      <span className="rounded bg-black/70 px-2 py-1 text-xs text-white/80">{labels.noPerson}</span>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="poses-title" className="flex flex-col gap-3">
        <h2 id="poses-title" className="text-base font-semibold text-fg">
          {labels.title}
        </h2>
        <SettingRow title={labels.enabled}>
          {({ labelId }) => (
            <Switch
              checked={config.poseDetectionEnabled || false}
              onCheckedChange={(poseDetectionEnabled) => updateSettings({ poseDetectionEnabled })}
              aria-labelledby={labelId}
            />
          )}
        </SettingRow>
        <Field label={labels.source} hint={labels.help}>
          {(aria) => (
            <input
              {...aria}
              value={config.poseCameraSource || ""}
              placeholder={labels.sourcePlaceholder}
              onChange={(e) => setConfig((c) => ({ ...c, poseCameraSource: e.target.value }))}
              onBlur={(e) => updateSettings({ poseCameraSource: e.target.value.trim() })}
              className={inputClass}
            />
          )}
        </Field>
      </section>

      <section className="flex flex-col gap-2">
        <SkeletonCanvas
          frame={frame}
          ghost={selected?.template}
          ghostHands={selected?.hands}
          overlay={recorderOverlay}
        />
        {status === "hands-unavailable" && (
          <span className="flex items-center gap-1.5 text-xs text-warn-text">
            <AlertTriangle aria-hidden className="w-3.5 h-3.5 shrink-0" />
            {labels.statusHandsUnavailable}
          </span>
        )}
        <RecordControls
          ticks={ticks}
          onTicksChange={setTicks}
          disabled={!cameraReady || recorder.busy}
          onRecord={() => record({ kind: "new" }, ticksToParts(ticks))}
          error={recordError}
          labels={labels}
        />
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-text"
        >
          {labels.saveError} {error}
        </div>
      )}

      <section aria-labelledby="poses-list" className="flex flex-col gap-2">
        <h2 id="poses-list" className="text-base font-semibold text-fg">
          {labels.listTitle}
        </h2>
        {visible.length === 0 && <EmptyState title={labels.empty} />}
        {visible.map((pose) => (
          <PoseCard
            key={pose.id}
            pose={pose}
            onChange={replacePose}
            onDelete={() => deletePose(pose)}
            onPreview={() => preview(pose)}
            onOpenChange={(open) => setSelectedId(open ? pose.id : null)}
            onRecord={
              pose.kind === "custom"
                ? (parts) => record({ kind: "rerecord", poseId: pose.id }, parts ?? pose.bodyParts)
                : undefined
            }
            recordDisabled={!cameraReady || recorder.busy || calibration.busy}
            onAddExample={
              pose.kind === "custom"
                ? () =>
                    record(
                      { kind: "example", poseId: pose.id },
                      pose.bodyParts.filter((p) => p !== "leftHand" && p !== "rightHand")
                    )
                : undefined
            }
            onCalibrate={pose.kind === "custom" ? () => calibration.start(pose.id) : undefined}
            calibration={
              calibration.phase.kind !== "idle" && calibration.phase.poseId === pose.id ? calibration.phase : undefined
            }
            onDismissCalibration={calibration.dismiss}
            weakJoint={weakJoints.get(pose.id)}
            liveScore={scores ? (scores.get(pose.id) ?? null) : undefined}
            similarTo={lookAlikes.get(pose.id)}
            liveCurls={liveCurls}
            labels={labels}
          />
        ))}
      </section>

      {file.hiddenBuiltins.length > 0 && (
        <Button onClick={() => update({ ...file, hiddenBuiltins: [] })} className="self-start">
          <RotateCcw aria-hidden className="w-4 h-4" />
          {labels.restore}
        </Button>
      )}

      <div className="flex gap-2 rounded-control border border-line bg-surface px-3 py-3">
        <Lightbulb aria-hidden className="w-4 h-4 shrink-0 text-fg-subtle" />
        <ul className="flex flex-col gap-1 text-xs text-fg-muted leading-relaxed">
          <li>{labels.tipDistinct}</li>
          <li>{labels.tip2d}</li>
          <li>{labels.tipOnePerson}</li>
          <li>{labels.tipLight}</li>
          <li>{labels.tipHandFacing}</li>
          <li>{labels.tipHandsInFrame}</li>
          <li>{labels.tipHandsOverlap}</li>
        </ul>
      </div>
    </div>
  );
}
