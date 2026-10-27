import { useState } from "react";
import { AlertTriangle, ChevronDown, Circle, Eye, Gauge, Trash2 } from "lucide-react";
import type { BodyPart, Finger, Pose } from "../../types";
import type { CalibrationPhase } from "../../hooks/usePoseCalibration";
import { JOINT_PARTS, MAX_EXTRA_TEMPLATES, weakestFinger, type WeakJoint } from "../../lib/poseCalibration";
import { hasMedia } from "../../lib/poseMedia";
import { liveHandFor } from "../../lib/handRecording";
import { Button, Field, StatusPill, Switch, cx, inputClass } from "../../ui";
import HandFingers from "./HandFingers";
import PoseMediaEditor from "./PoseMediaEditor";
import { NumberField, Toggle } from "./fields";

const BODY_PARTS: BodyPart[] = ["arms", "legs", "head", "leftHand", "rightHand"];
const HAND_SIDES = [
  { part: "leftHand", side: "left" },
  { part: "rightHand", side: "right" },
] as const;

interface Props {
  pose: Pose;
  onChange: (pose: Pose) => void;
  onDelete: () => void;
  onPreview: () => Promise<string | null>;
  onOpenChange: (open: boolean) => void;
  /** Re-records the template (custom poses only); `parts` limits it, e.g. to one hand */
  onRecord?: (parts?: BodyPart[]) => void;
  recordDisabled: boolean;
  /** Records one more body example (custom poses only) */
  onAddExample?: () => void;
  /** Starts the "streaming normally" calibration (custom poses only) */
  onCalibrate?: () => void;
  /** Calibration state, only when it concerns this pose */
  calibration?: Exclude<CalibrationPhase, { kind: "idle" }>;
  onDismissCalibration: () => void;
  /** Joint farthest from the pose, from the dashboard camera */
  weakJoint?: WeakJoint;
  /** Live match % from the dashboard camera; undefined while the camera is off */
  liveScore?: number | null;
  /** Name of another pose this one looks too much like */
  similarTo?: string;
  /** Live finger curls per hand from the dashboard camera */
  liveCurls?: { left?: Record<Finger, number>; right?: Record<Finger, number> };
  labels: Record<string, string>;
}

// A joint is off by shoulder widths, a finger by a 0–1 curl: a joint counts double to compare them
const JOINT_VS_FINGER = 2;

function MatchBar({ score, threshold, label }: { score: number | null; threshold: number; label: string }) {
  const value = Math.round(score ?? 0);
  const matched = score !== null && score >= threshold;
  return (
    <div className="flex items-center gap-2 w-32 shrink-0" title={`${label}: ${score === null ? "–" : `${value} %`}`}>
      <div className="relative h-1.5 flex-1 rounded bg-surface-hover overflow-hidden">
        <div
          className={cx("absolute inset-y-0 left-0 transition-all", matched ? "bg-ok" : "bg-fg-subtle")}
          style={{ width: `${value}%` }}
        />
        {/* Threshold marker */}
        <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${threshold}%` }} />
      </div>
      <span className={cx("text-xs w-9 text-right tabular-nums", matched ? "text-ok-text" : "text-fg-subtle")}>
        <span className="sr-only">{label}: </span>
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
  onAddExample,
  onCalibrate,
  calibration,
  onDismissCalibration,
  weakJoint,
  liveScore,
  similarTo,
  liveCurls,
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
  // "Why didn't it fire": the joint or finger farthest from the recorded pose, while the match is under the threshold
  const weakText = (() => {
    if (pose.kind !== "custom" || liveScore === undefined || (liveScore !== null && liveScore >= pose.threshold)) {
      return null;
    }
    let finger: { name: Finger; distance: number } | null = null;
    for (const { part, side } of HAND_SIDES) {
      const template = pose.hands?.[side];
      const curls = liveCurls && liveHandFor(side, liveCurls, pose.mirror);
      if (!pose.bodyParts.includes(part) || !template || !curls) continue;
      const weak = weakestFinger(curls, template);
      if (weak && (!finger || weak.distance > finger.distance)) finger = { name: weak.finger, distance: weak.distance };
    }
    const joint = weakJoint && JOINT_PARTS[weakJoint.joint];
    if (joint && weakJoint && (!finger || weakJoint.distance * JOINT_VS_FINGER >= finger.distance)) {
      const side = joint.side ? labels[joint.side === "left" ? "sideLeft" : "sideRight"] : null;
      const name = labels[`joint${joint.part}`];
      return side ? `${name} (${side})` : name;
    }
    return finger ? labels[finger.name] : null;
  })();
  const examples = (pose.extraTemplates?.length ?? 0) + (pose.template ? 1 : 0);
  const bodyRecorded = !!pose.template && pose.bodyParts.some((p) => p !== "leftHand" && p !== "rightHand");
  const preview = async () => {
    setPreviewError(null);
    setPreviewError(await onPreview());
  };

  return (
    <article className="rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Switch
          checked={pose.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          aria-label={`${labels.poseEnabled}: ${pose.name}`}
        />
        <h3 className="flex-1 min-w-0 text-sm font-semibold text-fg">
          <button
            type="button"
            onClick={() => {
              setOpen(!open);
              onOpenChange(!open);
            }}
            aria-expanded={open}
            className="flex w-full items-center gap-2 text-left cursor-pointer rounded-control focus-ring"
          >
            <span className="truncate">{pose.name}</span>
            <ChevronDown
              aria-hidden
              className={cx("w-4 h-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")}
            />
          </button>
        </h3>
        {liveScore !== undefined && (
          <MatchBar score={liveScore} threshold={pose.kind === "builtin" ? 100 : pose.threshold} label={labels.match} />
        )}
        {pose.kind === "builtin" && <StatusPill tone="accent">{labels.builtin}</StatusPill>}
        {!hasMedia(pose) && <StatusPill tone="warn">{labels.needsMedia}</StatusPill>}
        <Button
          variant="ghost"
          onClick={onDelete}
          title={labels.hide}
          aria-label={labels.hide}
          className="p-2 hover:text-danger-text"
        >
          <Trash2 aria-hidden className="w-4 h-4" />
        </Button>
      </div>

      {similarTo && (
        <div className="flex items-center gap-2 px-4 pb-3 -mt-1 text-xs text-warn-text">
          <AlertTriangle aria-hidden className="w-3.5 h-3.5 shrink-0" />
          {labels.tooSimilar.replace("{name}", similarTo)}
        </div>
      )}

      {weakText && (
        <div className="px-4 pb-3 -mt-1 text-xs text-fg-subtle">{labels.weakest.replace("{part}", weakText)}</div>
      )}

      {open && (
        <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
          <Field label={labels.name}>
            {(aria) => (
              <input
                {...aria}
                value={name ?? pose.name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => e.key === "Enter" && commitName()}
                className={inputClass}
              />
            )}
          </Field>

          {/* The built-in pose is matched by fixed rules: no template, parts, threshold or mirror */}
          {pose.kind === "custom" && (
            <>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-xs font-semibold text-fg-muted">{labels.bodyParts}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {BODY_PARTS.map((part) => {
                    const side = part === "leftHand" ? "left" : part === "rightHand" ? "right" : null;
                    // A hand can't be ticked before it is recorded (the store rejects a ticked hand with no template)
                    if (side && !pose.hands?.[side] && !pose.bodyParts.includes(part)) {
                      return (
                        <Button
                          key={part}
                          disabled={recordDisabled || !onRecord}
                          onClick={() => onRecord?.([part])}
                          className="px-2.5 py-1 text-xs"
                        >
                          <Circle aria-hidden className="w-3 h-3 fill-danger text-danger" />
                          {labels[side === "left" ? "recordLeftHand" : "recordRightHand"]}
                        </Button>
                      );
                    }
                    return (
                      <Toggle
                        key={part}
                        checked={pose.bodyParts.includes(part)}
                        onChange={(checked) => setPart(part, checked)}
                        label={labels[part]}
                      />
                    );
                  })}
                </div>
              </fieldset>
              {HAND_SIDES.some(({ part }) => pose.bodyParts.includes(part)) && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-semibold text-fg-muted">{labels.hands}</h4>
                  {HAND_SIDES.filter(({ part }) => pose.bodyParts.includes(part)).map(({ part, side }) => {
                    const template = pose.hands?.[side];
                    return (
                      <div key={side} className="flex flex-col gap-1">
                        <span className="text-xs text-fg-subtle">{labels[part]}</span>
                        {template ? (
                          <HandFingers
                            template={template}
                            live={liveCurls && liveHandFor(side, liveCurls, pose.mirror)}
                            onChange={(t) => set({ hands: { ...pose.hands, [side]: t } })}
                            labels={labels}
                          />
                        ) : (
                          <span className="text-xs text-warn-text">{labels.handNotRecorded}</span>
                        )}
                      </div>
                    );
                  })}
                  <Toggle
                    checked={pose.handPosition !== false}
                    onChange={(handPosition) => set({ handPosition })}
                    label={labels.matchHandPosition}
                  />
                  <Toggle
                    checked={pose.handDirection !== false}
                    onChange={(handDirection) => set({ handDirection })}
                    label={labels.matchHandDirection}
                  />
                </div>
              )}
              <Toggle checked={pose.mirror} onChange={(mirror) => set({ mirror })} label={labels.mirror} />
              {onRecord && (
                <Button disabled={recordDisabled} onClick={() => onRecord()} className="self-start">
                  <Circle aria-hidden className="w-3 h-3 fill-danger text-danger" />
                  {labels.rerecord}
                </Button>
              )}
              {bodyRecorded && onAddExample && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={recordDisabled || examples > MAX_EXTRA_TEMPLATES}
                    onClick={onAddExample}
                    title={labels.tipAddExample}
                    className="self-start"
                  >
                    <Circle aria-hidden className="w-3 h-3 fill-danger text-danger" />
                    {labels.addExample}
                  </Button>
                  <span className="text-xs text-fg-subtle">{labels.examples.replace("{n}", String(examples))}</span>
                  {examples > 1 && (
                    <Button
                      variant="ghost"
                      onClick={() => set({ extraTemplates: (pose.extraTemplates ?? []).slice(0, -1) })}
                      className="px-2 py-1 text-xs"
                    >
                      {labels.removeExample}
                    </Button>
                  )}
                </div>
              )}
              {onCalibrate && bodyRecorded && (
                <div className="flex flex-col gap-1.5">
                  <Button
                    disabled={recordDisabled || calibration?.kind === "running"}
                    onClick={onCalibrate}
                    title={labels.tipCalibrate}
                    className="self-start"
                  >
                    <Gauge aria-hidden className="w-4 h-4" />
                    {labels.calibrate}
                  </Button>
                  {!calibration && <span className="text-xs text-fg-subtle">{labels.calibrateHelp}</span>}
                  {calibration?.kind === "running" && (
                    <span role="status" className="text-xs text-fg-muted">
                      {labels.calibrating.replace("{s}", String(calibration.secondsLeft))}
                    </span>
                  )}
                  {calibration?.kind === "done" && (
                    <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      {!calibration.suggestion ? (
                        <span className="text-warn-text">{labels.calibrateTooFew}</span>
                      ) : calibration.suggestion.fine ? (
                        <span>
                          {labels.calibrateOk
                            .replace("{threshold}", String(pose.threshold))
                            .replace("{peak}", String(Math.round(calibration.suggestion.peak)))}
                        </span>
                      ) : (
                        <>
                          <span>
                            {labels.calibrateResult
                              .replace("{peak}", String(Math.round(calibration.suggestion.peak)))
                              .replace("{suggested}", String(calibration.suggestion.suggested))}
                          </span>
                          <Button
                            variant="primary"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => {
                              set({ threshold: calibration.suggestion!.suggested });
                              onDismissCalibration();
                            }}
                          >
                            {labels.calibrateApply.replace("{suggested}", String(calibration.suggestion.suggested))}
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={onDismissCalibration}>
                        {labels.calibrateDismiss}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <Button variant="primary" onClick={() => void preview()}>
              <Eye aria-hidden className="w-4 h-4" />
              {labels.preview}
            </Button>
            {previewError && (
              <span role="alert" className="text-xs text-danger-text">
                {previewError}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
