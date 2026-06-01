import { CSSProperties, useState, useEffect, useRef, useCallback } from "react";
import { Bot, Flame, AlertTriangle, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { AlertPayload } from "../types";
import { locales, Language } from "../locales";
import { useQueueStore } from "../store/queueStore";
import { usePlaybackController } from "../hooks/usePlaybackController";
import { useLeaderElection } from "../hooks/useLeaderElection";

const FONT_MAP: Record<string, string> = {
  sans: "system-ui, -apple-system, sans-serif",
  mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  serif: "Georgia, 'Times New Roman', serif",
  display: 'Impact, "Arial Black", sans-serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
};

function getEntranceClass(animation: string | undefined, isActive: boolean): string {
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

function getGradientBg(position: string | undefined, opacity: number): string {
  const p = position ?? "bottom-left";
  const dir = p.startsWith("top") ? "to bottom" : p.startsWith("bottom") ? "to top" : "to right";
  return `linear-gradient(${dir}, rgba(0,0,0,${opacity}) 0%, rgba(0,0,0,${opacity * 0.5}) 60%, transparent 100%)`;
}

function getTransformOrigin(position: string | undefined): string {
  const p = position ?? "bottom-left";
  const v = p.startsWith("top") ? "top" : p.startsWith("bottom") ? "bottom" : "center";
  const h = p.endsWith("left") ? "left" : p.endsWith("right") ? "right" : "center";
  return `${v} ${h}`;
}

function getAbsolutePosition(position: string | undefined): CSSProperties {
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

export default function OBSOverlayView() {
  const [language, setLanguage] = useState<Language>("fr");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.language) setLanguage(s.language as Language);
      })
      .catch(() => {});
  }, []);

  const isLeader = useLeaderElection();
  const activeAlertRef = useRef<AlertPayload | null>(null);
  const cancelSkipRef = useRef<() => void>(() => {});
  const pauseRef = useRef<() => void>(() => {});
  const resumeRef = useRef<() => void>(() => {});
  const seekRef = useRef<(s: number) => void>(() => {});
  const setVolRef = useRef<(v: number) => void>(() => {});

  const { queue, setQueue, queueRef, wsStatus, socketRef } = useQueueStore();

  // Register playback control callbacks with store
  useEffect(() => {
    const { setSkipCallback, setPauseCallback, setResumeCallback } = useQueueStore.getState();

    setSkipCallback(() => cancelSkipRef.current());
    setPauseCallback(() => pauseRef.current());
    setResumeCallback(() => resumeRef.current());
    // register seek and volume callbacks (callable with numbers)
    const { setSeekCallback, setSetVolumeCallback } = useQueueStore.getState();
    setSeekCallback((s: number) => seekRef.current(s));
    setSetVolumeCallback((v: number) => setVolRef.current(v));
  }, []);

  // Wrapper for setQueue to match React.Dispatch<SetStateAction> signature
  const setQueueCompat = useCallback(
    (updater: AlertPayload[] | ((prev: AlertPayload[]) => AlertPayload[])) => {
      if (typeof updater === "function") {
        const currentQueue = useQueueStore.getState().queue;
        setQueue(updater(currentQueue));
      } else {
        setQueue(updater);
      }
    },
    [setQueue]
  );

  const {
    active,
    particles,
    isPaused,
    showControls,
    volume,
    progressBarRef,
    activeVideoRef,
    videoHandlers,
    togglePause,
    seekVideo,
    setVolume,
    handleProgressBarClick,
    onMouseEnterMedia,
    showControlsTemporarily,
    cancelCurrentAlert,
  } = usePlaybackController({ queue, setQueue: setQueueCompat, queueRef, socketRef, activeAlertRef, isLeader });

  useEffect(() => {
    cancelSkipRef.current = cancelCurrentAlert;
  }, [cancelCurrentAlert]);

  useEffect(() => {
    pauseRef.current = () => {
      if (!isPaused) togglePause();
    };
  }, [isPaused, togglePause]);

  useEffect(() => {
    resumeRef.current = () => {
      if (isPaused) togglePause();
    };
  }, [isPaused, togglePause]);

  useEffect(() => {
    // keep refs in sync so store callbacks call the latest functions
    seekRef.current = seekVideo;
    setVolRef.current = setVolume;
  }, [seekVideo, setVolume]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden w-screen h-screen p-0 m-0 ${
        active ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{ background: "transparent" }}
      onMouseMove={active ? showControlsTemporarily : undefined}
    >
      {wsStatus !== "connected" && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-slate-950/90 text-amber-500 border border-amber-500/30 px-3 py-1.5 rounded-full text-xs font-mono select-none animate-pulse">
          <AlertTriangle className="w-4.5 h-4.5" />
          <span>OBS Link: Reconnecting WS...</span>
        </div>
      )}

      {active && queue.length > 0 && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white/80 border border-white/10 px-2.5 py-1 rounded-full text-xs font-mono select-none pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
          {queue.length} {locales[language].overlay.queued}
        </div>
      )}

      {active && (
        <div className="absolute inset-x-0 bottom-1/2 translate-y-24 pointer-events-none flex justify-center z-10">
          <div className="relative w-[500px] h-[50px]">
            {particles.map((spark) => (
              <span
                key={spark.id}
                className="absolute sparkle-particle rounded-full pointer-events-none"
                style={
                  {
                    left: "50%",
                    bottom: "10%",
                    width: spark.size,
                    height: spark.size,
                    backgroundColor: spark.bg,
                    boxShadow: `0 0 8px ${spark.bg}`,
                    "--dx": spark.dx,
                    "--dy": spark.dy,
                    "--p-delay": spark.delay,
                    "--p-dur": spark.dur,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        </div>
      )}

      <div
        className={`relative z-20 transition-all duration-700 select-none mx-auto w-[100vw] h-[100vh] p-0 flex flex-col overflow-hidden ${getEntranceClass(active?.alertAnimation, !!active)}`}
      >
        {active && (
          <div
            className={`relative flex flex-col text-white overflow-hidden transition-all duration-300 w-full h-full rounded-none border-none ${
              active.alertStyle === "glass"
                ? "bg-white/[0.03] backdrop-blur-2xl shadow-2xl"
                : active.alertStyle === "glitch"
                  ? "bg-stone-950 shadow-[4px_4px_0_#ef4444] animate-glitch crt-overlay"
                  : active.alertStyle === "cyberpunk"
                    ? "bg-zinc-950 shadow-[4px_4px_24px_rgba(234,179,8,0.15)] [clip-path:polygon(0_0,95%_0,100%_15px,100%_100%,5%_100%,0_85%)]"
                    : "bg-slate-950/95 relative animate-neon-pulse"
            }`}
            style={
              {
                borderColor: active.alertStyle === "neon" ? active.neonColor : undefined,
                "--glow-color": active.neonColor,
              } as React.CSSProperties
            }
          >
            {active.alertStyle === "cyberpunk" && (
              <div className="absolute top-0 right-12 bg-yellow-400 text-zinc-950 font-mono text-[9px] px-2 py-0.5 tracking-wider font-extrabold uppercase">
                ALERT // COM_GATEWAY_IN
              </div>
            )}

            {/* Info panel — positioned by alertPosition */}
            <div
              style={{
                position: "absolute",
                zIndex: 10,
                maxWidth: "60%",
                ...getAbsolutePosition(active.alertPosition),
                fontFamily: FONT_MAP[active.alertFont ?? "sans"],
                transform: `scale(${active.alertScale ?? 1})`,
                transformOrigin: getTransformOrigin(active.alertPosition),
                background: getGradientBg(active.alertPosition, active.alertBgOpacity ?? 0.9),
                borderRadius: "0.75rem",
                padding: "1rem 1.5rem",
              }}
              className="pointer-events-none flex flex-col"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <img
                    src={active.authorAvatar}
                    alt="Avatar"
                    className="w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 object-cover shadow-lg"
                    style={{ borderColor: active.neonColor }}
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-1 -right-1 bg-indigo-600 rounded-full p-1 text-white border border-slate-950">
                    <Bot className="w-3 h-3" />
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-indigo-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest font-display flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 fill-indigo-400/20 text-indigo-400 shrink-0" />
                    {locales[language].overlay.newAlert}
                  </span>
                  <span
                    className={`text-lg sm:text-2xl font-black drop-shadow-md tracking-tight truncate ${
                      active.alertStyle === "cyberpunk"
                        ? "font-mono font-bold text-yellow-400"
                        : "font-sans font-extrabold"
                    }`}
                  >
                    {active.authorName}
                  </span>
                  {active.title && (
                    <span className="text-xs sm:text-sm text-white/70 font-medium truncate mt-0.5">{active.title}</span>
                  )}
                </div>
              </div>

              {(() => {
                const cleanedText = active.text ? active.text.replace(/https?:\/\/[^\s]+/gi, "").trim() : "";
                if (!cleanedText) return null;
                return (
                  <p
                    className={`text-xs sm:text-lg text-slate-100 leading-relaxed break-words drop-shadow-lg ${
                      active.alertStyle === "cyberpunk"
                        ? "font-mono text-[11px] sm:text-sm bg-zinc-900/80 p-2 sm:p-3 rounded border border-zinc-800"
                        : "font-sans font-medium"
                    }`}
                  >
                    {cleanedText}
                  </p>
                );
              })()}
            </div>

            {/* Media Canvas */}
            {(() => {
              const isVertical =
                active.provider === "tiktok" || active.provider === "instagram" || active.mediaUrl.includes("shorts");

              return (
                <div className="absolute inset-0 z-0 w-[100vw] h-[100vh] flex items-center justify-center overflow-hidden">
                  {active.type === "video" ? (
                    <>
                      <video
                        src={active.mediaUrl}
                        className={
                          isVertical
                            ? "absolute z-0 w-[120%] h-[120%] object-cover blur-[24px] opacity-50 pointer-events-none"
                            : "absolute inset-0 w-full h-full object-cover scale-110 blur-[40px] opacity-60 pointer-events-none"
                        }
                        autoPlay
                        muted
                        loop
                        playsInline
                        crossOrigin="anonymous"
                      />
                      <video
                        ref={activeVideoRef}
                        src={active.mediaUrl}
                        className={
                          isVertical
                            ? "relative h-[90vh] max-w-full object-contain z-10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto"
                            : "w-full h-full block relative z-10 object-contain pointer-events-auto bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"
                        }
                        autoPlay
                        playsInline
                        crossOrigin="anonymous"
                        {...videoHandlers}
                      />
                    </>
                  ) : active.type === "iframe" || active.type === "link" ? (
                    <div className="w-full h-full relative z-10 flex flex-col pt-0" onMouseEnter={onMouseEnterMedia}>
                      <iframe
                        src={
                          active.mediaUrl.includes("twitch.tv")
                            ? `${active.mediaUrl}&parent=${window.location.hostname}&autoplay=true`
                            : active.mediaUrl
                        }
                        title="Media Embed"
                        className="w-full h-full border-0 block absolute inset-0 z-0 bg-transparent pointer-events-none"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <>
                      <img
                        src={active.mediaUrl}
                        className="absolute inset-0 w-full h-full object-cover scale-110 blur-[40px] opacity-60 pointer-events-none"
                        alt=""
                      />
                      <img
                        src={active.mediaUrl}
                        alt="Discord Media"
                        className="w-full h-full block relative z-10 object-contain bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"
                        referrerPolicy="no-referrer"
                      />
                    </>
                  )}

                  {active.alertStyle === "neon" && (
                    <div
                      className="absolute inset-0 opacity-15 filter blur-2xl animate-pulse pointer-events-none z-0"
                      style={{ backgroundColor: active.neonColor }}
                    />
                  )}
                </div>
              );
            })()}

            {/* Playback controls */}
            {showControls && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-xl border border-white/10 pointer-events-auto select-none">
                <button
                  onClick={() => seekVideo(-5)}
                  className="text-white/70 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
                  title="-5s"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={togglePause}
                  className="text-white hover:text-white transition-colors p-1.5 bg-white/10 hover:bg-white/25 rounded-lg"
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => seekVideo(5)}
                  className="text-white/70 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
                  title="+5s"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-20 h-1 accent-white cursor-pointer"
                  title="Volume"
                />
              </div>
            )}

            {/* Progress Bar */}
            <div
              className="absolute bottom-0 left-0 w-full h-2.5 bg-slate-950/40 overflow-hidden z-20 cursor-pointer group"
              onClick={handleProgressBarClick}
            >
              <div
                ref={progressBarRef}
                className="h-full rounded-r-full transition-none group-hover:brightness-125"
                style={{
                  width: "100%",
                  backgroundColor: active.neonColor,
                  boxShadow: `0 0 10px ${active.neonColor}`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
