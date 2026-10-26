import type { ReactNode } from "react";

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      {icon && (
        <span aria-hidden className="text-fg-subtle">
          {icon}
        </span>
      )}
      <p className="text-sm text-fg-muted">{title}</p>
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
