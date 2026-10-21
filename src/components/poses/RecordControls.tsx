import { Circle } from "lucide-react";
import type { RecordTicks } from "../../lib/handRecording";
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
      <div className="flex flex-wrap gap-x-4 gap-y-2">
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
        <button
          type="button"
          disabled={disabled || none}
          onClick={onRecord}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
        >
          <Circle className="w-3 h-3 fill-red-400 text-red-400" />
          {labels.newPose}
        </button>
        <span className="text-[10px] font-mono text-white/30">{none ? labels.recordPick : labels.recordHelp}</span>
      </div>
      {error && <span className="text-[10px] font-mono text-red-300">{error}</span>}
    </>
  );
}
