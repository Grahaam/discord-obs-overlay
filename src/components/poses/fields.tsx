import { useState, type ReactNode } from "react";
import { Field, inputClass } from "../../ui";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold text-fg-muted">{children}</span>;
}

/** Compact labelled checkbox for per-pose options (the page-level switch uses the kit's Switch). */
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
    <label className="flex items-center gap-2 cursor-pointer min-h-6">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer accent-accent focus-ring"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label && <span className="text-sm text-fg-muted">{label}</span>}
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
    <Field label={label}>
      {(aria) => (
        <input
          {...aria}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className={inputClass}
        />
      )}
    </Field>
  );
}
