import { useId, type ReactNode } from "react";
import { cx } from "./cx";

interface SettingRowProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** Receives the ids of the title/description so the control can use them as aria-labelledby/describedby. */
  children: (props: { labelId: string; descriptionId: string | undefined }) => ReactNode;
}

/** A setting: title + description on the left, its control on the right (stacked on narrow screens). */
export function SettingRow({ title, description, icon, className, children }: SettingRowProps) {
  const id = useId();
  const descriptionId = description ? `${id}-desc` : undefined;
  return (
    <div className={cx("flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && <span className="mt-0.5 shrink-0 text-fg-subtle">{icon}</span>}
        <div className="min-w-0">
          <div id={`${id}-label`} className="text-sm font-semibold text-fg">
            {title}
          </div>
          {description && (
            <p id={descriptionId} className="text-xs text-fg-subtle leading-relaxed mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">{children({ labelId: `${id}-label`, descriptionId })}</div>
    </div>
  );
}
