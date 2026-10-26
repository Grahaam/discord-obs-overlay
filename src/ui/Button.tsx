import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong shadow-glow",
  secondary: "bg-surface-hover text-fg border border-line hover:border-line-strong",
  danger: "bg-danger-soft text-danger-text border border-danger/30 hover:border-danger",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
};

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-control px-3.5 py-2 text-sm font-semibold cursor-pointer focus-ring disabled:opacity-60 disabled:cursor-not-allowed",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
