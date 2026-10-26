import type { ReactNode } from "react";
import { cx } from "./cx";

export type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  ok: { pill: "bg-ok-soft text-ok-text border-ok/30", dot: "bg-ok" },
  warn: { pill: "bg-warn-soft text-warn-text border-warn/30", dot: "bg-warn" },
  danger: { pill: "bg-danger-soft text-danger-text border-danger/30", dot: "bg-danger" },
  accent: { pill: "bg-accent-soft text-accent-text border-accent/30", dot: "bg-accent" },
  neutral: { pill: "bg-surface-hover text-fg-muted border-line", dot: "bg-fg-subtle" },
};

/** Colored status label. The text carries the meaning; the dot is decoration. */
export function StatusPill({
  tone,
  children,
  pulse,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        c.pill,
        className
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", c.dot, pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
