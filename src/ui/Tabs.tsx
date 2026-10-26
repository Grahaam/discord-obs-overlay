import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Local tabs inside a section (the section-level navigation is the sidebar, see SidebarNav). */
export const Tabs = RadixTabs.Root;

export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTabs.List
      aria-label={label}
      className="flex gap-1 rounded-control bg-surface-hover p-1 w-fit max-w-full overflow-x-auto"
    >
      {children}
    </RadixTabs.List>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className="whitespace-nowrap rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-semibold text-fg-muted cursor-pointer focus-ring hover:text-fg data-[state=active]:bg-panel data-[state=active]:text-fg data-[state=active]:shadow"
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export const TabPanel = RadixTabs.Content;

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: ReactNode;
}

/** Sidebar navigation made of real links (so URLs, middle-click and back/forward work). */
export function SidebarNav({
  label,
  items,
  activeId,
  onNavigate,
  className,
}: {
  label: string;
  items: NavItem[];
  activeId: string;
  onNavigate: (item: NavItem) => void;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex lg:flex-col gap-1">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="shrink-0 lg:shrink">
              <a
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onNavigate(item);
                }}
                className={cx(
                  "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold focus-ring whitespace-nowrap",
                  active ? "bg-accent text-on-accent shadow-glow" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                )}
              >
                <span aria-hidden className="shrink-0">
                  {item.icon}
                </span>
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
