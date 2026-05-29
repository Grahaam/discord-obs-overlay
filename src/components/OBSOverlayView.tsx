import { useState, useEffect, useRef } from "react";
import { Bot, Flame, AlertTriangle, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { AlertPayload } from "../types";
import { locales, Language } from "../locales";
import { useOverlaySocket } from "../hooks/useOverlaySocket";
import { usePlaybackStateMachine } from "../hooks/usePlaybackStateMachine";

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

  // Need activeAlertRef for useOverlaySocket dedup — create it here, pass to both hooks
  const activeAlertRef = useRef<AlertPayload | null>(null);

  // cancelCurrentAlertRef is populated by usePlaybackStateMachine; we need to reference it
  // from the socket's onSkip callback. Since the ref object itself is stable across renders
  // and only its `.current` is mutated by the playback machine after first render, we can
  // safely close over it here.
  const cancelHolder = useRef<(() => void) | null>(null);

  const { queue, setQueue, queueRef, wsStatus, socketRef } = useOverlaySocket({
    onSkip: () => cancelHolder.current?.(),
    activeAlertRef,
  });

  const {
    activeAlert,
    particles,
    isPaused,
    setIsPaused,
    showControls,
    currentDuration,
    volume,
    setVolume,
    progressBarRef,
    activeVideoRef,
    ytPlayerRef,
    ytPlayerContainerRef,
    cancelCurrentAlertRef,
    onVideoEndedRef,
    onVideoErrorRef,
    onVideoLoadedMetadataRef,
    extendCurrentTimeoutRef,
    isPausedRef,
    isBufferingRef,
    pausedRemainingRef,
    timeoutEndRef,
    alertStartTimeRef,
    setActiveAlert,
    handleCanPlay,
    showControlsTemporarily,
    togglePause,
    seekVideo,
    handleProgressBarClick,
  } = usePlaybackStateMachine({ queue, setQueue, queueRef, socketRef, language });

  // Sync activeAlert into activeAlertRef for socket dedup
  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  // Bridge: keep cancelHolder synchronized with the playback machine's cancel ref so
  // the socket's onSkip callback can invoke the latest cancellation function.
  useEffect(() => {
    cancelHolder.current = cancelCurrentAlertRef.current;
  });

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden w-screen h-screen p-0 m-0 ${
        activeAlert ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{ background: "transparent" }}
      onMouseMove={activeAlert ? showControlsTemporarily : undefined}
    >
      {/* Reconnect status indicator */}
      {wsStatus !== "connected" && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-slate-950/90 text-amber-500 border border-amber-500/30 px-3 py-1.5 rounded-full text-xs font-mono select-none animate-pulse">
          <AlertTriangle className="w-4.5 h-4.5" />
          <span>OBS Link: Reconnecting WS...</span>
        </div>
      )}

      {/* Queue count badge */}
      {activeAlert && queue.length > 0 && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white/80 border border-white/10 px-2.5 py-1 rounded-full text-xs font-mono select-none pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
          {queue.length} {locales[language].overlay.queued}
        </div>
      )}

      {/* Particle sparks */}
      {activeAlert && (
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
                  } as any
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Alert Container */}
      {(() => {
        return (
          <div
            className={`relative z-20 transition-all duration-700 select-none mx-auto w-[100vw] h-[100vh] p-0 flex flex-col overflow-hidden ${
              activeAlert
                ? "translate-y-0 scale-100 opacity-100 rotate-0 pointer-events-auto"
                : "translate-y-16 scale-90 opacity-0 rotate-1 select-none pointer-events-none"
            }`}
          >
            {activeAlert && (
              <div
                className={`relative flex flex-col text-white overflow-hidden transition-all duration-300 w-full h-full rounded-none border-none ${
                  activeAlert.alertStyle === "glass"
                    ? "bg-white/[0.03] backdrop-blur-2xl shadow-2xl"
                    : activeAlert.alertStyle === "glitch"
                      ? "bg-stone-950 shadow-[4px_4px_0_#ef4444] animate-glitch crt-overlay"
                      : activeAlert.alertStyle === "cyberpunk"
                        ? "bg-zinc-950 shadow-[4px_4px_24px_rgba(234,179,8,0.15)] [clip-path:polygon(0_0,95%_0,100%_15px,100%_100%,5%_100%,0_85%)]"
                        : "bg-slate-950/95 relative animate-neon-pulse"
                }`}
                style={
                  {
                    borderColor: activeAlert.alertStyle === "neon" ? activeAlert.neonColor : undefined,
                    "--glow-color": activeAlert.neonColor,
                  } as any
                }
              >
                {activeAlert.alertStyle === "cyberpunk" && (
                  <div className="absolute top-0 right-12 bg-yellow-400 text-zinc-950 font-mono text-[9px] px-2 py-0.5 tracking-wider font-extrabold uppercase">
                    ALERT // COM_GATEWAY_IN
                  </div>
                )}

                <div className="relative z-10 flex flex-col p-4 sm:p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      <img
                        src={activeAlert.authorAvatar}
                        alt="Avatar"
                        className="w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 object-cover shadow-lg"
                        style={{ borderColor: activeAlert.neonColor }}
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
                          activeAlert.alertStyle === "cyberpunk"
                            ? "font-mono font-bold text-yellow-400"
                            : "font-sans font-extrabold"
                        }`}
                      >
                        {activeAlert.authorName}
                      </span>
                      {activeAlert.title && (
                        <span className="text-xs sm:text-sm text-white/70 font-medium truncate mt-0.5">
                          {activeAlert.title}
                        </span>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const cleanedText = activeAlert.text
                      ? activeAlert.text.replace(/https?:\/\/[^\s]+/gi, "").trim()
                      : "";
                    if (!cleanedText) return null;
                    return (
                      <p
                        className={`text-xs sm:text-lg text-slate-100 leading-relaxed break-words drop-shadow-lg ${
                          activeAlert.alertStyle === "cyberpunk"
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
                    activeAlert.provider === "tiktok" ||
                    activeAlert.provider === "instagram" ||
                    activeAlert.mediaUrl.includes("shorts");

                  return (
                    <div className="absolute inset-0 z-0 w-[100vw] h-[100vh] flex items-center justify-center overflow-hidden">
                      {activeAlert.type === "video" ? (
                        <>
                          {isVertical ? (
                            <video
                              src={activeAlert.mediaUrl}
                              className="absolute z-0 w-[120%] h-[120%] object-cover blur-[24px] opacity-50 pointer-events-none"
                              autoPlay
                              muted
                              loop
                              playsInline
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <video
                              src={activeAlert.mediaUrl}
                              className="absolute inset-0 w-full h-full object-cover scale-110 blur-[40px] opacity-60 pointer-events-none"
                              autoPlay
                              muted
                              loop
                              playsInline
                              crossOrigin="anonymous"
                            />
                          )}

                          <video
                            ref={activeVideoRef}
                            src={activeAlert.mediaUrl}
                            className={
                              isVertical
                                ? "relative h-[90vh] max-w-full object-contain z-10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto"
                                : "w-full h-full block relative z-10 object-contain pointer-events-auto bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"
                            }
                            autoPlay
                            muted
                            playsInline
                            crossOrigin="anonymous"
                            onEnded={() => onVideoEndedRef.current?.()}
                            onError={(e) => {
                              const err = e.currentTarget.error;
                              const rawUrl = activeAlert?.mediaUrl || "unknown";
                              console.error(`[Video] Error code ${err?.code}: ${err?.message} — ${rawUrl}`);
                              if (activeAlert && !activeAlert.mediaUrl.includes("retry=1")) {
                                const retryUrl =
                                  activeAlert.mediaUrl + (activeAlert.mediaUrl.includes("?") ? "&" : "?") + "retry=1";
                                setTimeout(() => {
                                  setActiveAlert((prev) => (prev ? { ...prev, mediaUrl: retryUrl } : prev));
                                }, 1000);
                              } else {
                                onVideoErrorRef.current?.();
                              }
                            }}
                            onCanPlay={handleCanPlay}
                            onLoadedMetadata={(e) => {
                              const durationMs = e.currentTarget.duration * 1000;
                              if (durationMs && isFinite(durationMs)) {
                                onVideoLoadedMetadataRef.current?.(durationMs);
                              }
                            }}
                            onWaiting={() => {
                              // Browser is stalling to buffer — not a user-initiated pause
                              isBufferingRef.current = true;
                            }}
                            onPlaying={() => {
                              // Buffering resolved; if the user paused during buffering, stay paused
                              isBufferingRef.current = false;
                            }}
                            onPause={() => {
                              // Ignore browser-internal pause events fired during buffering stalls
                              if (isBufferingRef.current) return;
                              if (!isPausedRef.current) {
                                pausedRemainingRef.current = Math.max(1000, timeoutEndRef.current - Date.now());
                                isPausedRef.current = true;
                                setIsPaused(true);
                              }
                              extendCurrentTimeoutRef.current?.(3600000);
                            }}
                            onPlay={() => {
                              if (isPausedRef.current && !isBufferingRef.current) {
                                const remaining = pausedRemainingRef.current || 5000;
                                extendCurrentTimeoutRef.current?.(remaining);
                                alertStartTimeRef.current = Date.now() - (currentDuration - remaining);
                                isPausedRef.current = false;
                                setIsPaused(false);
                              }
                            }}
                          />
                        </>
                      ) : activeAlert.type === "iframe" || activeAlert.type === "link" ? (
                        <div
                          className="w-full h-full relative z-10 flex flex-col pt-0"
                          onMouseEnter={() => extendCurrentTimeoutRef.current?.(3600000)}
                        >
                          {activeAlert.mediaUrl.includes("youtube.com/embed") ? (
                            <div ref={ytPlayerContainerRef} className="w-full h-full" />
                          ) : (
                            <iframe
                              src={
                                activeAlert.mediaUrl.includes("twitch.tv")
                                  ? `${activeAlert.mediaUrl}&parent=${window.location.hostname}&autoplay=true`
                                  : activeAlert.mediaUrl
                              }
                              title="Media Embed"
                              className="w-full h-full border-0 block absolute inset-0 z-0 bg-transparent pointer-events-none"
                              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
                              allowFullScreen
                            />
                          )}
                        </div>
                      ) : (
                        <>
                          <img
                            src={activeAlert.mediaUrl}
                            className="absolute inset-0 w-full h-full object-cover scale-110 blur-[40px] opacity-60 pointer-events-none"
                            alt=""
                          />
                          <img
                            src={activeAlert.mediaUrl}
                            alt="Discord Media"
                            className="w-full h-full block relative z-10 object-contain bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"
                            referrerPolicy="no-referrer"
                          />
                        </>
                      )}

                      {activeAlert.alertStyle === "neon" && (
                        <div
                          className="absolute inset-0 opacity-15 filter blur-2xl animate-pulse pointer-events-none z-0"
                          style={{ backgroundColor: activeAlert.neonColor }}
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
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setVolume(v);
                        if (activeVideoRef.current) activeVideoRef.current.volume = v;
                        if (ytPlayerRef.current) {
                          try {
                            ytPlayerRef.current.setVolume(v * 100);
                          } catch (_e) {
                            /* YT Player API not always ready */
                          }
                        }
                        try {
                          localStorage.setItem("overlay_volume", String(v));
                        } catch (_e) {
                          /* localStorage may be blocked */
                        }
                      }}
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
                      backgroundColor: activeAlert.neonColor,
                      boxShadow: `0 0 10px ${activeAlert.neonColor}`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
