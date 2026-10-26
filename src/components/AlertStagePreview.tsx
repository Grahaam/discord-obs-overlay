import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bot, Flame } from "lucide-react";
import type { AlertAnimation, AlertFont, AlertPosition } from "../types";
import { FONT_MAP, getAbsolutePosition, getEntranceClass, getGradientBg, getTransformOrigin } from "../lib/alertLayout";

export interface StageLook {
  alertStyle: "neon" | "glitch" | "cyberpunk" | "glass";
  neonColor: string;
  alertFont: AlertFont;
  alertScale: number;
  alertBgOpacity: number;
  alertAnimation: AlertAnimation;
  alertPosition: AlertPosition;
}

export interface StageAlert {
  authorName: string;
  text: string;
  mediaUrl: string;
  type: string;
  newAlertLabel: string;
}

// The overlay is rendered full-screen by OBS (1920x1080 browser source). The preview draws that same frame at its
// logical size and scales it down, so every size, position and style matches what the stream shows.
const STAGE_W = 1920;
const STAGE_H = 1080;

const isVideoFile = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);
const isImageFile = (url: string) =>
  /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url) || /images\.unsplash\.com/.test(url);

/**
 * Dashboard preview of an alert, drawn with the overlay's own classes and layout helpers.
 * `replayKey` changing replays the entrance animation (the Trigger / Replay buttons bump it).
 * Always dark: it imitates the stream, not the dashboard chrome.
 */
export default function AlertStagePreview({
  look,
  alert,
  replayKey,
}: {
  look: StageLook;
  alert: StageAlert;
  replayKey: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / STAGE_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Replay: hide for a frame, then play the entrance transition again. Also when the animation type changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(false);
    const id = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(id);
  }, [replayKey, look.alertAnimation]);

  const media = alert.mediaUrl.trim();
  const video = alert.type === "video" && isVideoFile(media);
  const image = !video && isImageFile(media);
  const cleanText = alert.text.replace(/https?:\/\/[^\s]+/gi, "").trim();
  const { alertStyle, neonColor } = look;

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-card border border-line bg-black"
      style={{ aspectRatio: "16 / 9" }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        <div className={`h-full w-full transition-all duration-700 ${getEntranceClass(look.alertAnimation, visible)}`}>
          <div
            className={`relative flex h-full w-full flex-col overflow-hidden text-white ${
              alertStyle === "glass"
                ? "bg-white/[0.03] backdrop-blur-2xl shadow-2xl"
                : alertStyle === "glitch"
                  ? "bg-stone-950 shadow-[4px_4px_0_#ef4444] animate-glitch crt-overlay"
                  : alertStyle === "cyberpunk"
                    ? "bg-zinc-950 shadow-[4px_4px_24px_rgba(234,179,8,0.15)] [clip-path:polygon(0_0,95%_0,100%_15px,100%_100%,5%_100%,0_85%)]"
                    : "bg-slate-950/95 relative animate-neon-pulse"
            }`}
            style={
              { "--glow-color": neonColor, borderColor: alertStyle === "neon" ? neonColor : undefined } as CSSProperties
            }
          >
            {alertStyle === "cyberpunk" && (
              <div className="absolute right-12 top-0 z-10 bg-yellow-400 px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider text-zinc-950">
                ALERT // COM_GATEWAY_IN
              </div>
            )}

            <div
              style={{
                position: "absolute",
                zIndex: 10,
                maxWidth: "60%",
                ...getAbsolutePosition(look.alertPosition),
                fontFamily: FONT_MAP[look.alertFont],
                transform: `scale(${look.alertScale})`,
                transformOrigin: getTransformOrigin(look.alertPosition),
                background: getGradientBg(look.alertPosition, look.alertBgOpacity),
                borderRadius: "0.75rem",
                padding: "1rem 1.5rem",
              }}
              className="pointer-events-none flex flex-col"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="relative">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full border-2 bg-slate-800 text-2xl shadow-lg"
                    style={{ borderColor: neonColor }}
                  >
                    👤
                  </div>
                  <span className="absolute -bottom-1 -right-1 rounded-full border border-slate-950 bg-indigo-600 p-1 text-white">
                    <Bot className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1 font-display text-xs font-bold uppercase tracking-widest text-indigo-400">
                    <Flame className="h-3.5 w-3.5 shrink-0 fill-indigo-400/20 text-indigo-400" />
                    {alert.newAlertLabel}
                  </span>
                  <span
                    className={`truncate text-2xl tracking-tight drop-shadow-md ${
                      alertStyle === "cyberpunk" ? "font-mono font-bold text-yellow-400" : "font-sans font-extrabold"
                    }`}
                  >
                    {alert.authorName}
                  </span>
                </div>
              </div>
              {cleanText && (
                <p
                  className={`break-words text-lg leading-relaxed text-slate-100 drop-shadow-lg ${
                    alertStyle === "cyberpunk"
                      ? "rounded border border-zinc-800 bg-zinc-900/80 p-3 font-mono text-sm"
                      : "font-sans font-medium"
                  }`}
                >
                  {cleanText}
                </p>
              )}
            </div>

            <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
              {video ? (
                <video
                  src={media}
                  className="relative z-10 h-full w-full object-contain"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : image ? (
                <>
                  <img
                    src={media}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-[40px]"
                  />
                  <img
                    src={media}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="relative z-10 block h-full w-full object-contain drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"
                  />
                </>
              ) : (
                // Page links (YouTube, TikTok…) are resolved to a real file by the server at play time
                <div
                  className="h-full w-full opacity-40"
                  style={{ background: `radial-gradient(circle at 50% 45%, ${neonColor}55, transparent 65%)` }}
                />
              )}
              {alertStyle === "neon" && (
                <div
                  className="pointer-events-none absolute inset-0 z-0 animate-pulse opacity-15 blur-2xl"
                  style={{ backgroundColor: neonColor }}
                />
              )}
            </div>

            <div className="absolute bottom-0 left-0 z-20 h-2.5 w-full overflow-hidden bg-slate-950/40">
              <div
                className="h-full w-[55%] rounded-r-full"
                style={{ backgroundColor: neonColor, boxShadow: `0 0 10px ${neonColor}` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
