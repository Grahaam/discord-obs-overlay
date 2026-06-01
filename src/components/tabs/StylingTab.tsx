import { TabProps } from "./types";
import { Palette, Sparkles } from "lucide-react";
import { AlertFont, AlertPosition, AlertAnimation } from "../../types";

const STYLE_PRESETS = [
  {
    id: "neon",
    preview: { border: "#6366f1", glow: "rgba(99,102,241,0.4)", bg: "rgba(99,102,241,0.06)" },
  },
  {
    id: "glitch",
    preview: { border: "#ec4899", glow: "rgba(236,72,153,0.4)", bg: "rgba(236,72,153,0.06)" },
  },
  {
    id: "cyberpunk",
    preview: { border: "#eab308", glow: "rgba(234,179,8,0.4)", bg: "rgba(234,179,8,0.05)" },
  },
  {
    id: "glass",
    preview: { border: "rgba(255,255,255,0.2)", glow: "rgba(255,255,255,0.1)", bg: "rgba(255,255,255,0.04)" },
  },
] as const;

const SWATCHES = ["#6366f1", "#ec4899", "#10b981", "#eab308", "#ef4444", "#a855f7"];

const FONT_MAP: Record<string, string> = {
  sans: "system-ui, -apple-system, sans-serif",
  mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  serif: "Georgia, 'Times New Roman', serif",
  display: 'Impact, "Arial Black", sans-serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
};

const FONT_OPTIONS: { id: AlertFont; labelKey: keyof ReturnType<typeof getFontLabels> }[] = [
  { id: "sans", labelKey: "fontSans" },
  { id: "mono", labelKey: "fontMono" },
  { id: "serif", labelKey: "fontSerif" },
  { id: "display", labelKey: "fontDisplay" },
  { id: "rounded", labelKey: "fontRounded" },
];

function getFontLabels(t: NonNullable<TabProps["t"]>) {
  return {
    fontSans: t.display.fontSans,
    fontMono: t.display.fontMono,
    fontSerif: t.display.fontSerif,
    fontDisplay: t.display.fontDisplay,
    fontRounded: t.display.fontRounded,
  };
}

const POSITION_GRID: AlertPosition[][] = [
  ["top-left", "top-center", "top-right"],
  ["center-left", "center", "center-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];

const ANIMATION_OPTIONS: { id: AlertAnimation; labelKey: "animSlideUp" | "animFade" | "animZoom" | "animBounce" }[] = [
  { id: "slide-up", labelKey: "animSlideUp" },
  { id: "fade", labelKey: "animFade" },
  { id: "zoom", labelKey: "animZoom" },
  { id: "bounce", labelKey: "animBounce" },
];

function getPreviewBg(style: string, opacity: number): string {
  const alpha = opacity.toFixed(2);
  switch (style) {
    case "glitch":
      return `rgba(10,5,5,${alpha})`;
    case "cyberpunk":
      return `rgba(10,10,5,${alpha})`;
    case "glass":
      return `rgba(255,255,255,${(opacity * 0.04).toFixed(3)})`;
    case "neon":
    default:
      return `rgba(0,0,0,${alpha})`;
  }
}

export default function StylingTab(props: TabProps) {
  const { config, setConfig, t } = props;
  if (config === undefined || setConfig === undefined || t === undefined) return null;

  const neonColor = config.neonColor || "#6366f1";
  const alertStyle = config.alertStyle || "neon";
  const alertFont = config.alertFont ?? "sans";
  const alertScale = config.alertScale ?? 1;
  const alertBgOpacity = config.alertBgOpacity ?? 0.9;
  const alertAnimation = config.alertAnimation ?? "slide-up";
  const alertPosition = config.alertPosition ?? "bottom-left";

  const fontLabels = getFontLabels(t);

  const previewBg = getPreviewBg(alertStyle, alertBgOpacity);
  const previewBoxShadow =
    alertStyle === "glitch"
      ? `0 0 18px ${neonColor}66, 2px 2px 0 rgba(236,72,153,0.3)`
      : alertStyle === "glass"
        ? `0 4px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.08)`
        : `0 0 18px ${neonColor}66`;

  const previewBorder =
    alertStyle === "glass" ? "rgba(255,255,255,0.18)" : neonColor;

  const previewFilter = alertStyle === "glass" ? "blur(0px)" : undefined;

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center shrink-0">
          <Palette className="w-4 h-4 text-fuchsia-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold font-mono text-white tracking-wider uppercase">{t.display.title}</h2>
          <p className="text-[10px] text-white/30 mt-0.5 font-mono">{t.display.desc}</p>
        </div>
      </div>

      {/* Live Preview */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.livePreview}</label>
        <div
          className="flex items-center justify-center rounded-xl border border-white/[0.06] bg-black/40 py-6 px-4 overflow-hidden"
          style={{ minHeight: 120 }}
        >
          <div style={{ transform: `scale(${alertScale})`, transformOrigin: "center center", transition: "transform 0.2s" }}>
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                width: 280,
                background: previewBg,
                border: `1.5px solid ${previewBorder}`,
                boxShadow: previewBoxShadow,
                fontFamily: FONT_MAP[alertFont],
                backdropFilter: alertStyle === "glass" ? "blur(12px)" : undefined,
                WebkitBackdropFilter: alertStyle === "glass" ? "blur(12px)" : undefined,
              }}
            >
              {/* Cyberpunk accent tab */}
              {alertStyle === "cyberpunk" && (
                <div
                  className="absolute top-0 left-0 h-full w-0.5"
                  style={{ background: neonColor }}
                />
              )}

              <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base select-none"
                  style={{
                    border: `2px solid ${neonColor}`,
                    boxShadow: `0 0 8px ${neonColor}55`,
                    background: "rgba(0,0,0,0.5)",
                  }}
                >
                  👤
                </div>

                {/* Text */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="text-[9px] uppercase tracking-widest leading-none mb-0.5"
                    style={{ color: `${neonColor}cc`, fontFamily: FONT_MAP[alertFont] }}
                  >
                    ⚡ New Alert
                  </span>
                  <span
                    className="text-sm font-bold leading-tight truncate"
                    style={{ color: "#fff", fontFamily: FONT_MAP[alertFont] }}
                  >
                    Viewer_42
                  </span>
                  <span
                    className="text-[11px] leading-snug mt-0.5 truncate"
                    style={{ color: "rgba(255,255,255,0.55)", fontFamily: FONT_MAP[alertFont] }}
                  >
                    Look at this clip!
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-0.5 w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: "55%",
                    background: `linear-gradient(90deg, ${neonColor}, ${neonColor}88)`,
                    boxShadow: `0 0 6px ${neonColor}88`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Theme cards */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.visualTheme}</label>
        <div className="grid grid-cols-2 gap-2.5">
          {STYLE_PRESETS.map((style) => {
            const labels = {
              neon: { label: t.display.neonStyle, desc: t.display.neonDesc },
              glitch: { label: t.display.glitchStyle, desc: t.display.glitchDesc },
              cyberpunk: { label: t.display.cyberpunkStyle, desc: t.display.cyberpunkDesc },
              glass: { label: t.display.glassStyle, desc: t.display.glassDesc },
            };
            const { label, desc } = labels[style.id];
            const isActive = config.alertStyle === style.id;

            return (
              <button
                key={style.id}
                onClick={() => setConfig({ ...config, alertStyle: style.id })}
                className="relative p-3.5 rounded-xl border text-left flex flex-col gap-2 cursor-pointer transition-all duration-200 overflow-hidden"
                style={{
                  borderColor: isActive ? style.preview.border : "rgba(255,255,255,0.06)",
                  background: isActive ? style.preview.bg : "rgba(255,255,255,0.015)",
                  boxShadow: isActive ? `0 0 12px ${style.preview.glow}` : "none",
                }}
              >
                {/* Mini preview bar */}
                <div
                  className="h-0.5 w-full rounded-full opacity-60"
                  style={{
                    background: isActive
                      ? `linear-gradient(90deg, ${style.preview.border}, transparent)`
                      : "rgba(255,255,255,0.06)",
                  }}
                />
                <div>
                  <span className="text-xs font-bold font-mono text-white block leading-tight">{label}</span>
                  <span className="text-[10px] font-mono text-white/35 mt-0.5 block leading-snug">{desc}</span>
                </div>
                {isActive && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: style.preview.border }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Font Picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.fontLabel}</label>
        <div className="flex gap-1.5 flex-wrap">
          {FONT_OPTIONS.map(({ id, labelKey }) => {
            const isActive = alertFont === id;
            return (
              <button
                key={id}
                onClick={() => setConfig({ ...config, alertFont: id })}
                className="px-3 py-1.5 rounded-full border text-xs transition-all duration-150 cursor-pointer"
                style={{
                  fontFamily: FONT_MAP[id],
                  borderColor: isActive ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)",
                  background: isActive ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.03)",
                  color: isActive ? "rgba(199,210,254,1)" : "rgba(255,255,255,0.4)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                }}
              >
                {fontLabels[labelKey]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Position Picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.positionLabel}</label>
        <div className="flex items-center gap-3">
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(3, 28px)" }}>
            {POSITION_GRID.map((row, ri) =>
              row.map((pos) => {
                const isActive = alertPosition === pos;
                return (
                  <button
                    key={pos}
                    onClick={() => setConfig({ ...config, alertPosition: pos })}
                    title={pos}
                    className="rounded transition-all duration-150 cursor-pointer"
                    style={{
                      width: 28,
                      height: 28,
                      border: isActive ? `1.5px solid ${neonColor}` : "1.5px solid rgba(255,255,255,0.08)",
                      background: isActive ? `${neonColor}22` : "rgba(255,255,255,0.03)",
                      boxShadow: isActive ? `0 0 6px ${neonColor}44` : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      className="block rounded-full"
                      style={{
                        width: 6,
                        height: 6,
                        background: isActive ? neonColor : "rgba(255,255,255,0.2)",
                        // position dot hint based on row/col
                        alignSelf:
                          ri === 0 ? "flex-start" : ri === 2 ? "flex-end" : "center",
                        marginTop: ri === 0 ? 2 : undefined,
                        marginBottom: ri === 2 ? 2 : undefined,
                      }}
                    />
                  </button>
                );
              })
            )}
          </div>
          <span className="text-[10px] font-mono text-white/30 leading-tight">
            {alertPosition.replace(/-/g, " ")}
          </span>
        </div>
      </div>

      {/* Scale + Opacity sliders (2-col) */}
      <div className="grid grid-cols-2 gap-4">
        {/* Scale */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.scaleLabel}</label>
            <span className="text-[10px] font-mono text-white/50">{alertScale.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.05}
            value={alertScale}
            onChange={(e) => setConfig({ ...config, alertScale: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(90deg, ${neonColor} ${((alertScale - 0.5) / 1.5) * 100}%, rgba(255,255,255,0.1) ${((alertScale - 0.5) / 1.5) * 100}%)`,
              accentColor: neonColor,
            }}
          />
        </div>

        {/* Opacity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.opacityLabel}</label>
            <span className="text-[10px] font-mono text-white/50">{Math.round(alertBgOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={alertBgOpacity}
            onChange={(e) => setConfig({ ...config, alertBgOpacity: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(90deg, ${neonColor} ${alertBgOpacity * 100}%, rgba(255,255,255,0.1) ${alertBgOpacity * 100}%)`,
              accentColor: neonColor,
            }}
          />
        </div>
      </div>

      {/* Animation Picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.animationLabel}</label>
        <div className="flex gap-1.5 flex-wrap">
          {ANIMATION_OPTIONS.map(({ id, labelKey }) => {
            const isActive = alertAnimation === id;
            return (
              <button
                key={id}
                onClick={() => setConfig({ ...config, alertAnimation: id })}
                className="px-3 py-1.5 rounded-full border text-xs font-mono transition-all duration-150 cursor-pointer"
                style={{
                  borderColor: isActive ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)",
                  background: isActive ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.03)",
                  color: isActive ? "rgba(199,210,254,1)" : "rgba(255,255,255,0.4)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                }}
              >
                {t.display[labelKey]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Color */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-white/25" />
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.display.customColor}</label>
        </div>

        <div className="flex gap-2.5 items-center">
          {/* Live preview swatch */}
          <div
            className="w-10 h-10 rounded-lg shrink-0 border border-white/10"
            style={{
              backgroundColor: config.neonColor,
              boxShadow: `0 0 12px ${config.neonColor}55`,
            }}
          />
          <input
            type="text"
            placeholder="#6366f1"
            value={config.neonColor}
            onChange={(e) => setConfig({ ...config, neonColor: e.target.value })}
            className="bg-[#08080f] flex-1 border border-white/[0.07] rounded-lg px-4 py-2.5 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all"
          />
        </div>

        {/* Swatches */}
        <div className="flex flex-col gap-1.5 mt-0.5">
          <span className="text-[10px] font-mono text-white/25">{t.display.colorSwatches}</span>
          <div className="flex gap-2">
            {SWATCHES.map((color) => (
              <button
                key={color}
                onClick={() => setConfig({ ...config, neonColor: color })}
                className="w-6 h-6 rounded-full transition-all hover:scale-110 active:scale-95 ring-offset-[#0a0a0f] ring-offset-1 cursor-pointer"
                style={{
                  backgroundColor: color,
                  boxShadow: config.neonColor === color ? `0 0 8px ${color}` : "none",
                  outline: config.neonColor === color ? `1.5px solid ${color}` : "none",
                  outlineOffset: "2px",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
