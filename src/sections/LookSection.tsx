import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Play, RotateCcw, Send, Square } from "lucide-react";
import AlertStagePreview from "../components/AlertStagePreview";
import { FONT_MAP } from "../lib/alertLayout";
import { useDashboard } from "../dashboard/DashboardContext";
import { Button, Field, SettingRow, Slider, Switch, cx, inputClass } from "../ui";
import type { AlertAnimation, AlertFont, AlertPosition, MediaType } from "../types";

// The preview colors below (presets, previewBg, shadows, inner card) mirror the OBS overlay look on purpose:
// they are NOT dashboard chrome and must not follow the dashboard theme.
const STYLE_PRESETS = [
  { id: "neon", border: "#6366f1" },
  { id: "glitch", border: "#ec4899" },
  { id: "cyberpunk", border: "#eab308" },
  { id: "glass", border: "rgba(255,255,255,0.35)" },
] as const;

const SWATCHES = ["#6366f1", "#ec4899", "#10b981", "#eab308", "#ef4444", "#a855f7"];

const FONT_OPTIONS: { id: AlertFont; key: "fontSans" | "fontMono" | "fontSerif" | "fontDisplay" | "fontRounded" }[] = [
  { id: "sans", key: "fontSans" },
  { id: "mono", key: "fontMono" },
  { id: "serif", key: "fontSerif" },
  { id: "display", key: "fontDisplay" },
  { id: "rounded", key: "fontRounded" },
];

const POSITIONS: AlertPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const ANIMATION_OPTIONS: { id: AlertAnimation; key: "animSlideUp" | "animFade" | "animZoom" | "animBounce" }[] = [
  { id: "slide-up", key: "animSlideUp" },
  { id: "fade", key: "animFade" },
  { id: "zoom", key: "animZoom" },
  { id: "bounce", key: "animBounce" },
];

const PRESETS: { label: string; url: string; type: MediaType }[] = [
  { label: "YT Shorts", url: "https://youtube.com/shorts/OX6wSAsiedI?si=qeSpni-1XCmidrqK", type: "video" },
  { label: "YouTube", url: "https://www.youtube.com/watch?v=UZ6jGyK8F-I", type: "video" },
  {
    label: "TikTok",
    url: "https://www.tiktok.com/@pepe_fails/video/7620170003371003156?is_from_webapp=1&sender_device=pc",
    type: "video",
  },
  { label: "Instagram", url: "https://www.instagram.com/p/DYnCi2IhHHE", type: "image" },
];

const optionClass = (active: boolean) =>
  cx(
    "rounded-control border px-3 py-1.5 text-sm cursor-pointer focus-ring",
    active
      ? "border-accent bg-accent-soft text-accent-text font-semibold"
      : "border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg"
  );

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-fg-muted">{label}</h3>
      {children}
    </div>
  );
}

export default function LookSection() {
  const { t, config, setConfig } = useDashboard();

  const [simName, setSimName] = useState("Viewer_Lucky_Hype");
  const [simText, setSimText] = useState("Un clip sur le boss final ce soir ! GG");
  const [simType, setSimType] = useState<MediaType>("image");
  const [simMediaUrl, setSimMediaUrl] = useState(
    "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1280&auto=format&fit=crop"
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const soundRef = useRef<HTMLAudioElement | null>(null);

  // Stop a running sound preview when leaving the page
  useEffect(
    () => () => {
      soundRef.current?.pause();
    },
    []
  );

  const handleSoundPreview = () => {
    if (!config.alertSoundUrl) return;
    if (soundPlaying && soundRef.current) {
      soundRef.current.pause();
      soundRef.current.currentTime = 0;
      setSoundPlaying(false);
      return;
    }
    const audio = new Audio(config.alertSoundUrl);
    soundRef.current = audio;
    audio
      .play()
      .then(() => {
        setSoundPlaying(true);
        audio.onended = () => setSoundPlaying(false);
      })
      .catch(() => setSoundPlaying(false));
  };

  const neonColor = config.neonColor || "#6366f1";
  const alertStyle = config.alertStyle || "neon";
  const alertFont = config.alertFont ?? "sans";
  const alertScale = config.alertScale ?? 1;
  const alertBgOpacity = config.alertBgOpacity ?? 0.9;
  const alertAnimation = config.alertAnimation ?? "slide-up";
  const alertPosition = config.alertPosition ?? "bottom-left";

  const styleLabels = {
    neon: { label: t.display.neonStyle, desc: t.display.neonDesc },
    glitch: { label: t.display.glitchStyle, desc: t.display.glitchDesc },
    cyberpunk: { label: t.display.cyberpunkStyle, desc: t.display.cyberpunkDesc },
    glass: { label: t.display.glassStyle, desc: t.display.glassDesc },
  };

  const handleTriggerTest = async () => {
    await fetch("/api/trigger-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorName: simName, text: simText, type: simType, mediaUrl: simMediaUrl }),
    });
  };

  const handleSend = async () => {
    if (!simMediaUrl.trim()) {
      setUrlError(true);
      return;
    }
    setSending(true);
    setUrlError(false);
    try {
      setReplayKey((k) => k + 1);
      await handleTriggerTest();
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-fg">{t.look.title}</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <section aria-labelledby="look-preview" className="sticky top-28 z-10 flex flex-col gap-2 bg-canvas py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="look-preview" className="text-base font-semibold text-fg">
                {t.display.livePreview}
              </h2>
              <div className="flex gap-2">
                <Button className="py-1.5 text-xs" onClick={() => setReplayKey((k) => k + 1)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  {t.look.replay}
                </Button>
                <Button variant="primary" className="py-1.5 text-xs" onClick={handleSend} disabled={sending}>
                  {sent ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {sent ? t.logs.simSent : t.logs.sendSim}
                </Button>
              </div>
            </div>
            {/* Same frame, classes and layout helpers as the OBS overlay; always dark like the stream. */}
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <AlertStagePreview
                replayKey={replayKey}
                look={{ alertStyle, neonColor, alertFont, alertScale, alertBgOpacity, alertAnimation, alertPosition }}
                alert={{
                  authorName: simName,
                  text: simText,
                  mediaUrl: simMediaUrl,
                  type: simType,
                  newAlertLabel: t.overlay.newAlert,
                }}
              />
            </div>
            <p className="hidden text-xs text-fg-subtle sm:block">{t.look.testHint}</p>
            <span role="status" className="sr-only">
              {sent ? t.logs.simSent : ""}
            </span>
          </section>

          <section aria-labelledby="look-sim" className="flex flex-col gap-4">
            <div>
              <h2 id="look-sim" className="text-base font-semibold text-fg">
                {t.logs.simTitle}
              </h2>
              <p className="text-xs text-fg-subtle mt-0.5">{t.logs.simSubtitle}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t.logs.simName}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    value={simName}
                    onChange={(e) => setSimName(e.target.value)}
                    className={inputClass}
                  />
                )}
              </Field>
              <Field label={t.logs.simType}>
                {(p) => (
                  <select
                    {...p}
                    value={simType}
                    onChange={(e) => setSimType(e.target.value as MediaType)}
                    className={cx(inputClass, "cursor-pointer")}
                  >
                    <option value="image">{t.logs.simTypeAuto}</option>
                    <option value="video">{t.logs.simTypeVideo}</option>
                    <option value="iframe">{t.logs.simTypeIframe}</option>
                    <option value="link">{t.logs.simTypeLink}</option>
                  </select>
                )}
              </Field>
            </div>

            <Field label={t.logs.simText}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>

            <Field label={t.look.mediaUrl} error={urlError ? t.logs.simUrlRequired : undefined}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  placeholder="https://youtube.com/..."
                  value={simMediaUrl}
                  onChange={(e) => {
                    setSimMediaUrl(e.target.value);
                    if (urlError) setUrlError(false);
                  }}
                  className={cx(inputClass, "font-mono")}
                />
              )}
            </Field>

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  className="text-xs"
                  onClick={() => {
                    setSimMediaUrl(p.url);
                    setSimType(p.type);
                    setUrlError(false);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <Button variant="primary" onClick={handleSend} disabled={sending} className="w-full py-3 lg:hidden">
              {sent ? (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {t.logs.simSent}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  {t.logs.sendSim}
                </>
              )}
            </Button>
          </section>
        </div>

        <section aria-labelledby="look-style" className="flex flex-col gap-4">
          <h2 id="look-style" className="text-base font-semibold text-fg">
            {t.display.title}
          </h2>

          <Group label={t.display.visualTheme}>
            <div
              role="radiogroup"
              aria-label={t.display.visualTheme}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              {STYLE_PRESETS.map((style) => {
                const { label, desc } = styleLabels[style.id];
                const active = alertStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setConfig((c) => ({ ...c, alertStyle: style.id }))}
                    className={cx(
                      "relative flex flex-col gap-1 rounded-card border p-3.5 text-left cursor-pointer focus-ring",
                      active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-hover"
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-1 w-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${style.border}, transparent)` }}
                    />
                    <span className="text-sm font-semibold text-fg mt-1">{label}</span>
                    <span className="text-xs text-fg-subtle leading-snug">{desc}</span>
                  </button>
                );
              })}
            </div>
          </Group>

          <Group label={t.display.fontLabel}>
            <div role="radiogroup" aria-label={t.display.fontLabel} className="flex flex-wrap gap-2">
              {FONT_OPTIONS.map(({ id, key }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={alertFont === id}
                  onClick={() => setConfig((c) => ({ ...c, alertFont: id }))}
                  className={optionClass(alertFont === id)}
                  style={{ fontFamily: FONT_MAP[id] }}
                >
                  {t.display[key]}
                </button>
              ))}
            </div>
          </Group>

          <Group label={t.display.animationLabel}>
            <div role="radiogroup" aria-label={t.display.animationLabel} className="flex flex-wrap gap-2">
              {ANIMATION_OPTIONS.map(({ id, key }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={alertAnimation === id}
                  onClick={() => setConfig((c) => ({ ...c, alertAnimation: id }))}
                  className={optionClass(alertAnimation === id)}
                >
                  {t.display[key]}
                </button>
              ))}
            </div>
          </Group>

          <Group label={t.display.positionLabel}>
            <div className="flex items-center gap-3">
              <div
                role="radiogroup"
                aria-label={t.display.positionLabel}
                className="grid gap-1"
                style={{ gridTemplateColumns: "repeat(3, 32px)" }}
              >
                {POSITIONS.map((pos) => {
                  const active = alertPosition === pos;
                  return (
                    <button
                      key={pos}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={pos.replace(/-/g, " ")}
                      title={pos.replace(/-/g, " ")}
                      onClick={() => setConfig((c) => ({ ...c, alertPosition: pos }))}
                      className={cx(
                        "flex h-8 w-8 items-center justify-center rounded-control border cursor-pointer focus-ring",
                        active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-hover"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cx("block h-2 w-2 rounded-full", active ? "bg-accent" : "bg-fg-subtle")}
                      />
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-fg-subtle">{alertPosition.replace(/-/g, " ")}</span>
            </div>
          </Group>

          <div className="divide-y divide-line">
            <SettingRow title={t.display.scaleLabel}>
              {({ labelId }) => (
                <div className="flex items-center gap-3 sm:w-72">
                  <Slider
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={alertScale}
                    onValueChange={(v) => setConfig((c) => ({ ...c, alertScale: v }))}
                    aria-labelledby={labelId}
                    valueText={`${alertScale.toFixed(2)}×`}
                  />
                  <span className="w-12 text-right text-xs tabular-nums text-fg-muted">{alertScale.toFixed(2)}×</span>
                </div>
              )}
            </SettingRow>
            <SettingRow title={t.display.opacityLabel}>
              {({ labelId }) => (
                <div className="flex items-center gap-3 sm:w-72">
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={alertBgOpacity}
                    onValueChange={(v) => setConfig((c) => ({ ...c, alertBgOpacity: v }))}
                    aria-labelledby={labelId}
                    valueText={`${Math.round(alertBgOpacity * 100)}%`}
                  />
                  <span className="w-12 text-right text-xs tabular-nums text-fg-muted">
                    {Math.round(alertBgOpacity * 100)}%
                  </span>
                </div>
              )}
            </SettingRow>
          </div>

          <Group label={t.display.customColor}>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-10 w-10 shrink-0 rounded-control border border-line"
                style={{ backgroundColor: config.neonColor, boxShadow: `0 0 12px ${config.neonColor}55` }}
              />
              <Field label={<span className="sr-only">{t.display.customColor}</span>} className="flex-1">
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    placeholder="#6366f1"
                    value={config.neonColor}
                    onChange={(e) => setConfig((c) => ({ ...c, neonColor: e.target.value }))}
                    className={cx(inputClass, "font-mono")}
                  />
                )}
              </Field>
            </div>
            <span className="text-xs text-fg-subtle">{t.display.colorSwatches}</span>
            <div role="radiogroup" aria-label={t.display.colorSwatches} className="flex gap-2.5">
              {SWATCHES.map((color) => {
                const active = config.neonColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={color}
                    title={color}
                    onClick={() => setConfig((c) => ({ ...c, neonColor: color }))}
                    className="h-7 w-7 rounded-full cursor-pointer focus-ring hover:scale-110"
                    style={{
                      backgroundColor: color,
                      outline: active ? `2px solid ${color}` : "none",
                      outlineOffset: 2,
                    }}
                  />
                );
              })}
            </div>
          </Group>
        </section>

        <section aria-labelledby="look-sound" className="flex flex-col gap-4">
          <h2 id="look-sound" className="text-base font-semibold text-fg">
            {t.look.groupSound}
          </h2>

          <Field label={t.bot.alertSound} hint={t.bot.alertSoundHelp}>
            {(aria) => (
              <div className="flex gap-2">
                <input
                  {...aria}
                  type="url"
                  placeholder="https://example.com/alert.mp3"
                  value={config.alertSoundUrl || ""}
                  onChange={(e) => setConfig((c) => ({ ...c, alertSoundUrl: e.target.value }))}
                  className={inputClass}
                />
                {config.alertSoundUrl && (
                  <Button
                    variant={soundPlaying ? "primary" : "secondary"}
                    onClick={handleSoundPreview}
                    aria-label={soundPlaying ? t.connections.stopPreview : t.connections.previewSound}
                    title={soundPlaying ? t.connections.stopPreview : t.connections.previewSound}
                  >
                    {soundPlaying ? (
                      <Square className="h-4 w-4" aria-hidden />
                    ) : (
                      <Play className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                )}
              </div>
            )}
          </Field>

          <SettingRow title={t.bot.syncDuration} description={t.bot.syncDurationHelp}>
            {({ labelId, descriptionId }) => (
              <Switch
                checked={config.syncDurationWithMedia || false}
                onCheckedChange={(checked) => setConfig((c) => ({ ...c, syncDurationWithMedia: checked }))}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
              />
            )}
          </SettingRow>

          <Field label={t.bot.duration} hint={t.bot.durationHelp}>
            {(aria) => (
              <div className="relative">
                <input
                  {...aria}
                  type="number"
                  placeholder="8000"
                  value={config.alertDuration}
                  onChange={(e) => setConfig((c) => ({ ...c, alertDuration: Number(e.target.value) }))}
                  disabled={config.syncDurationWithMedia}
                  className={cx(inputClass, "pr-14")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-xs text-fg-subtle">
                  {!config.syncDurationWithMedia ? `${(config.alertDuration / 1000).toFixed(1)}s` : "ms"}
                </span>
              </div>
            )}
          </Field>
        </section>
      </div>
    </div>
  );
}
