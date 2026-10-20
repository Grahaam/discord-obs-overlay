import { useState, type ReactNode } from "react";

export const inputBase =
  "bg-[#08080f] w-full border border-white/[0.07] rounded-lg px-3 py-2 text-xs font-mono text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/20 transition-all";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[10px] font-mono text-white/30">{children}</span>;
}

/** Same look as the dashboard's other checkboxes (BotTab). */
export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div
        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
          checked ? "bg-violet-600 border-violet-500" : "bg-transparent border-white/20 group-hover:border-white/40"
        }`}
      >
        <input
          type="checkbox"
          className="hidden"
          checked={checked}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.checked)}
        />
        {checked && (
          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      {label && (
        <span className="text-[10px] font-mono text-white/40 group-hover:text-white/70 transition-colors leading-snug">
          {label}
        </span>
      )}
    </label>
  );
}

/**
 * Number input that keeps what is typed and clamps on blur: min/max only bound the
 * spinner arrows, so saving every keystroke would send "2" to a 5–3600 field.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  // null while not editing: the field then shows the saved value, even if it changes elsewhere
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    const next = Number.isFinite(n) && draft.trim() !== "" ? Math.min(max, Math.max(min, n)) : value;
    setDraft(null);
    if (next !== value) onCommit(next);
  };
  return (
    <label className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={inputBase}
      />
    </label>
  );
}
