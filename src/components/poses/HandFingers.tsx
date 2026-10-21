import type { Finger, FingerState, HandTemplate } from "../../types";
import { FINGERS, fingerState } from "../../lib/handMatcher";

const NEXT: Record<FingerState, FingerState> = { up: "down", down: "any", any: "up" };
const CHIP: Record<FingerState, string> = {
  up: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  down: "border-red-400/40 bg-red-500/15 text-red-300",
  any: "border-white/10 bg-white/[0.03] text-white/30",
};
const STATE_LABEL: Record<FingerState, string> = { up: "fingerUp", down: "fingerDown", any: "fingerAny" };

interface Props {
  template: HandTemplate;
  /** Live curls (0–1) from the dashboard camera, when this hand is seen */
  live?: Record<Finger, number>;
  onChange: (t: HandTemplate) => void;
  labels: Record<string, string>;
}

/** Five finger chips cycling up → down → any, with the recorded curl % and a live glow. */
export default function HandFingers({ template, live, onChange, labels }: Props) {
  const cycle = (finger: Finger) =>
    onChange({ ...template, fingers: { ...template.fingers, [finger]: NEXT[template.fingers[finger]] } });

  return (
    <div className="flex gap-1.5">
      {FINGERS.map((finger) => {
        const state = template.fingers[finger];
        const liveState = live && fingerState(finger, live[finger]);
        // Glow only for a wanted state: green when the live finger agrees, red otherwise
        const glow =
          !liveState || state === "any"
            ? ""
            : liveState === state
              ? "ring-2 ring-emerald-400/70"
              : "ring-2 ring-red-400/70";
        return (
          <div key={finger} className="flex flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={() => cycle(finger)}
              title={`${labels[finger]}: ${labels[STATE_LABEL[state]]} · ${labels.fingerCycle}`}
              aria-label={`${labels[finger]}: ${labels[STATE_LABEL[state]]}`}
              className={`w-16 rounded-lg border px-1.5 py-1 text-[10px] font-mono transition-shadow ${CHIP[state]} ${glow}`}
            >
              {labels[finger]}
            </button>
            <span className="text-[9px] font-mono text-white/25">{Math.round(template.curls[finger] * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}
