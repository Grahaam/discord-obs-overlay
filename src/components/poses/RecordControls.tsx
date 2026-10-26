import { Circle } from "lucide-react";
import type { RecordTicks } from "../../lib/handRecording";
import { Button } from "../../ui";
import { Toggle } from "./fields";

interface Props {
  ticks: RecordTicks;
  onTicksChange: (ticks: RecordTicks) => void;
  disabled: boolean;
  onRecord: () => void;
  error: string | null;
  labels: Record<string, string>;
}

/** "Record a new pose": the parts to record (Body / Left hand / Right hand) and the button. */
export default function RecordControls({ ticks, onTicksChange, disabled, onRecord, error, labels }: Props) {
  const none = !ticks.body && !ticks.leftHand && !ticks.rightHand;
  return (
    <>
      <div role="group" aria-label={labels.bodyParts} className="flex flex-wrap gap-x-4 gap-y-2">
        {(["body", "leftHand", "rightHand"] as const).map((key) => (
          <Toggle
            key={key}
            checked={ticks[key]}
            onChange={(checked) => onTicksChange({ ...ticks, [key]: checked })}
            label={labels[key]}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={disabled || none} onClick={onRecord}>
          <Circle aria-hidden className="w-3 h-3 fill-current" />
          {labels.newPose}
        </Button>
        <span className="text-xs text-fg-subtle">{none ? labels.recordPick : labels.recordHelp}</span>
      </div>
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </>
  );
}
