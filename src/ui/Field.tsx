import { useId, type ReactNode } from "react";
import * as Label from "@radix-ui/react-label";
import { cx } from "./cx";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** Receives the ids to wire onto the control so the label, hint and error are announced with it. */
  children: (props: { id: string; "aria-describedby": string | undefined; "aria-invalid": boolean }) => ReactNode;
}

/** Label + control + hint/error, with the ids wired for assistive tech. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Label.Root htmlFor={id} className="text-xs font-semibold text-fg-muted">
        {label}
      </Label.Root>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": !!error })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-fg-subtle leading-relaxed">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
