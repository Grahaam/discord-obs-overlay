// Layout helpers shared by the OBS overlay and the dashboard preview, so both render alerts the same way.
import type { CSSProperties } from "react";

export const FONT_MAP: Record<string, string> = {
  sans: "system-ui, -apple-system, sans-serif",
  mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  serif: "Georgia, 'Times New Roman', serif",
  display: 'Impact, "Arial Black", sans-serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
};

export function getEntranceClass(animation: string | undefined, isActive: boolean): string {
  if (!isActive) {
    switch (animation) {
      case "fade":
        return "opacity-0 scale-100 translate-y-0 rotate-0 pointer-events-none select-none";
      case "zoom":
        return "opacity-0 scale-50 translate-y-0 rotate-0 pointer-events-none select-none";
      case "bounce":
        return "opacity-0 scale-75 translate-y-0 rotate-0 pointer-events-none select-none";
      default:
        return "translate-y-16 scale-90 opacity-0 rotate-1 pointer-events-none select-none";
    }
  }
  return "translate-y-0 scale-100 opacity-100 rotate-0 pointer-events-auto";
}

export function getGradientBg(position: string | undefined, opacity: number): string {
  const p = position ?? "bottom-left";
  const dir = p.startsWith("top") ? "to bottom" : p.startsWith("bottom") ? "to top" : "to right";
  return `linear-gradient(${dir}, rgba(0,0,0,${opacity}) 0%, rgba(0,0,0,${opacity * 0.5}) 60%, transparent 100%)`;
}

export function getTransformOrigin(position: string | undefined): string {
  const p = position ?? "bottom-left";
  const v = p.startsWith("top") ? "top" : p.startsWith("bottom") ? "bottom" : "center";
  const h = p.endsWith("left") ? "left" : p.endsWith("right") ? "right" : "center";
  return `${v} ${h}`;
}

export function getAbsolutePosition(position: string | undefined): CSSProperties {
  const p = position ?? "bottom-left";
  const style: CSSProperties = {};
  if (p.startsWith("top")) style.top = "1.5rem";
  else if (p.startsWith("bottom")) style.bottom = "1.5rem";
  else {
    style.top = "50%";
    style.marginTop = "-4rem";
  }
  if (p.endsWith("left")) style.left = "1.5rem";
  else if (p.endsWith("right")) style.right = "1.5rem";
  else {
    style.left = "50%";
    style.marginLeft = "-15rem";
  }
  return style;
}
