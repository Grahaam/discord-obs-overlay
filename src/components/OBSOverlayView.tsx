import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Tv, Bot, Flame, AlertTriangle, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { AlertPayload, Sparkle } from "../types";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

// Deterministic playback states — no arbitrary timeouts drive transitions.
type PlaybackState = "waiting" | "preloading" | "ready" | "playing" | "finished" | "failed";

export default function OBSOverlayView({
  embedMode = false,
  onQueueChange,
}: {
  embedMode?: boolean;
  onQueueChange?: (queue: AlertPayload[]) => void;
}) {
  const [queue, setQueue] = useState<AlertPayload[]>([]);
  const [activeAlert, setActiveAlert] = useState<AlertPayload | null>(null);
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, boolean>>({});
  const [particles, setParticles] = useState<Sparkle[]>([]);
  const [currentDuration, setCurrentDuration] = useState(8000);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Refs that don't cause rerenders — critical for OBS performance
  const playbackStateRef = useRef<PlaybackState>("waiting");
  const activeAlertRef = useRef<AlertPayload | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const onVideoEndedRef = useRef<(() => void) | null>(null);
  const onVideoErrorRef = useRef<(() => void) | null>(null);
  const onVideoLoadedMetadataRef = useRef<((durationMs: number) => void) | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const alertStartTimeRef = useRef<number>(0);
  const cancelCurrentAlertRef = useRef<(() => void) | null>(null);
  const extendCurrentTimeoutRef = useRef<((durationMs: number) => void) | null>(null);
  const isPausedRef = useRef(false);
  const pausedRemainingRef = useRef(0);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutEndRef = useRef(0);
  const togglePauseRef = useRef<() => void>(() => {});
  const seekVideoRef = useRef<(s: number) => void>(() => {});

  // Keep activeAlertRef in sync for use in async callbacks
  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Socket connection — reconnect-safe with state reconciliation
  useEffect(() => {
    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setWsStatus("connected");
      console.log("[Overlay] Socket connected, requesting queue state");
      socket.emit("get_initial_state");
    });

    // On reconnect, merge server queue with local state — deduplicate by ID
    socket.on("initial_state", (serverQueue: AlertPayload[]) => {
      setQueue((prev) => {
        const knownIds = new Set([
          ...prev.map((a) => a.id),
          ...(activeAlertRef.current ? [activeAlertRef.current.id] : []),
        ]);
        const newItems = serverQueue.filter((a) => !knownIds.has(a.id));
        if (newItems.length > 0) {
          console.log(`[Overlay] Reconciled ${newItems.length} new item(s) from server`);
        }
        return [...prev, ...newItems];
      });
    });

    socket.on("disconnect", () => {
      setWsStatus("disconnected");
      console.log("[Overlay] Socket disconnected");
    });

    socket.on("connect_error", () => {
      setWsStatus("connecting");
    });

    // Heartbeat — update connection status, no queue action needed (handled via initial_state on reconnect)
    socket.on("heartbeat", (_data: { ts: number; queueSize: number }) => {
      // Presence of heartbeat confirms server is alive
    });

    socket.on("new_alert", (alert: AlertPayload) => {
      setQueue((prev) => {
        if (prev.some((item) => item.id === alert.id)) return prev;
        if (activeAlertRef.current?.id === alert.id) return prev;
        return [...prev, alert];
      });
    });

    socket.on("force_queue_update", (newQueue: AlertPayload[]) => {
      setQueue(newQueue);
    });

    socket.on("remove_queue_item", (itemId: string) => {
      setQueue((prev) => prev.filter((item) => item.id !== itemId));
    });

    socket.on("clear_queue", () => {
      setQueue([]);
    });

    socket.on("skip_alert", () => {
      console.log("[Overlay] Skip requested");
      cancelCurrentAlertRef.current?.();
    });

    return () => {
      socket.close();
    };
  }, []);

  // Keyboard shortcuts: stop, pause/resume, seek
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeAlert) return;
      const configKey = (activeAlert.stopAlertShortcut || "Escape").toLowerCase();
      const isSpace = e.key === " " || e.code === "Space";

      const matchesStop =
        e.key.toLowerCase() === configKey ||
        e.code.toLowerCase() === configKey ||
        (configKey === "space" && isSpace) ||
        (configKey === "escape" && e.key === "Escape");

      if (matchesStop) {
        e.preventDefault();
        e.stopPropagation();
        cancelCurrentAlertRef.current?.();
        return;
      }

      if (isSpace) {
        e.preventDefault();
        togglePauseRef.current();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekVideoRef.current(-5);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekVideoRef.current(5);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeAlert]);

  // Phase 2: preload next items in queue using hidden elements
  useEffect(() => {
    queue.forEach((item) => {
      if (preloadedUrls[item.mediaUrl]) return;

      if (item.type === "iframe" || item.type === "link") {
        setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
        return;
      }

      if (item.type === "image") {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.src = item.mediaUrl;
        img.onload = () => setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
        img.onerror = () => setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
        return;
      }

      // Video: wait for canplaythrough before marking ready
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = item.mediaUrl;
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;

      const markReady = () => setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
      video.oncanplaythrough = markReady;
      video.onerror = markReady; // don't stall on broken media
    });
  }, [queue, preloadedUrls]);

  // YouTube Player — init/destroy with active alert lifecycle
  useEffect(() => {
    if (!activeAlert || !activeAlert.mediaUrl.includes("youtube.com/embed")) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      }
      return;
    }

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || !ytPlayerContainerRef.current) {
        setTimeout(initPlayer, 200);
        return;
      }

      const match = activeAlert.mediaUrl.match(/\/embed\/([^?]+)/);
      const videoId = match ? match[1] : "";

      ytPlayerRef.current = new window.YT.Player(ytPlayerContainerRef.current, {
        height: "100%",
        width: "100%",
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          fs: 0,
          disablekb: 1,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
          },
          onStateChange: (event: any) => {
            if (event.data === 0) onVideoEndedRef.current?.();
          },
          onError: () => {
            onVideoErrorRef.current?.();
          },
        },
      });
    };

    initPlayer();

    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      }
    };
  }, [activeAlert]);

  // Core playback loop — event-driven state machine
  const runNextAlert = useCallback(async () => {
    if (queue.length === 0) return;
    if (playbackStateRef.current !== "waiting") return;

    playbackStateRef.current = "preloading";
    const nextItem = { ...queue[0] };
    setQueue((prev) => prev.slice(1));
    setCurrentDuration(nextItem.duration || 8000);

    // Generate spark particles
    const newSparkles: Sparkle[] = [];
    const particleColors = [nextItem.neonColor, "#ffffff", "#fbcfe8", "#c7d2fe"];
    for (let i = 0; i < 40; i++) {
      const randomColor = particleColors[Math.floor(Math.random() * particleColors.length)];
      newSparkles.push({
        id: i,
        dx: `${(Math.random() * 300 - 150).toFixed(0)}px`,
        dy: `${(Math.random() * -240 - 60).toFixed(0)}px`,
        size: `${(Math.random() * 10 + 4).toFixed(0)}px`,
        delay: `${(Math.random() * 1.2).toFixed(2)}s`,
        dur: `${(Math.random() * 2 + 1.2).toFixed(2)}s`,
        bg: randomColor,
      });
    }
    setParticles(newSparkles);

    playbackStateRef.current = "ready";
    setActiveAlert(nextItem);

    // Small rAF delay to let React flush DOM before binding events
    await new Promise((r) => requestAnimationFrame(r));

    playbackStateRef.current = "playing";

    let resolveFinish: (() => void) | null = null;
    const finishPromise = new Promise<void>((resolve) => {
      resolveFinish = resolve;
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finishAlert = () => {
      if (playbackStateRef.current === "finished" || playbackStateRef.current === "waiting") return;
      playbackStateRef.current = "finished";
      if (timeoutId) clearTimeout(timeoutId);
      onVideoEndedRef.current = null;
      onVideoErrorRef.current = null;
      onVideoLoadedMetadataRef.current = null;
      resolveFinish?.();
      resolveFinish = null;
    };

    const extendTimeout = (newDurationMs: number) => {
      if (timeoutId) clearTimeout(timeoutId);
      setCurrentDuration(newDurationMs);
      const ms = Math.max(newDurationMs, 2000);
      timeoutEndRef.current = Date.now() + ms;
      timeoutId = setTimeout(finishAlert, ms);
    };

    cancelCurrentAlertRef.current = finishAlert;
    extendCurrentTimeoutRef.current = extendTimeout;

    const defaultDuration = nextItem.duration || 8000;

    if (nextItem.type === "video") {
      if (nextItem.syncDurationWithMedia) {
        onVideoEndedRef.current = finishAlert;
        onVideoLoadedMetadataRef.current = (durationMs) => {
          setCurrentDuration(durationMs);
          extendCurrentTimeoutRef.current?.(durationMs);
        };
        timeoutEndRef.current = Date.now() + 300000;
        timeoutId = setTimeout(finishAlert, 300000); // 5 min hard cap
      } else {
        timeoutEndRef.current = Date.now() + defaultDuration;
        timeoutId = setTimeout(finishAlert, defaultDuration);
      }
      onVideoErrorRef.current = finishAlert;
    } else if ((nextItem.type === "iframe" || nextItem.type === "link") && nextItem.syncDurationWithMedia) {
      if (nextItem.mediaUrl.includes("youtube.com/embed")) {
        onVideoEndedRef.current = finishAlert;
        onVideoErrorRef.current = finishAlert;
        timeoutEndRef.current = Date.now() + 300000;
        timeoutId = setTimeout(finishAlert, 300000);
      } else {
        timeoutEndRef.current = Date.now() + 240000;
        timeoutId = setTimeout(finishAlert, 240000);
      }
    } else {
      timeoutEndRef.current = Date.now() + defaultDuration;
      timeoutId = setTimeout(finishAlert, defaultDuration);
    }

    await finishPromise;
    cancelCurrentAlertRef.current = null;

    isPausedRef.current = false;
    setIsPaused(false);
    setShowControls(false);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);

    setActiveAlert(null);
    setParticles([]);

    if (socketRef.current) {
      socketRef.current.emit("alert_played", nextItem.id);
    }

    if (activeVideoRef.current) {
      activeVideoRef.current.pause();
    }

    // CSS exit transition
    await new Promise((r) => setTimeout(r, 800));

    playbackStateRef.current = "waiting";
  }, [queue]);

  useEffect(() => {
    if (playbackStateRef.current === "waiting" && queue.length > 0) {
      runNextAlert();
    }
  }, [queue, runNextAlert]);

  useEffect(() => {
    if (onQueueChange) onQueueChange(queue);
  }, [queue, onQueueChange]);

  // Progress bar — rAF-driven, no setState during playback
  useEffect(() => {
    let animationFrameId: number;

    const updateProgress = () => {
      if (!activeAlert || !progressBarRef.current) return;

      // Freeze bar when paused (video type self-freezes via currentTime; timer-based needs explicit check)
      if (isPausedRef.current && !(activeAlert.type === "video" && activeAlert.syncDurationWithMedia)) {
        animationFrameId = requestAnimationFrame(updateProgress);
        return;
      }

      let progress = 0;
      if (activeAlert.type === "video" && activeVideoRef.current && activeAlert.syncDurationWithMedia) {
        const video = activeVideoRef.current;
        progress = video.duration ? 1 - video.currentTime / video.duration : 1;
      } else {
        const elapsed = Date.now() - alertStartTimeRef.current;
        progress = 1 - elapsed / currentDuration;
      }

      progress = Math.max(0, Math.min(1, progress));
      progressBarRef.current.style.width = `${progress * 100}%`;

      if (progress > 0) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    if (activeAlert) {
      alertStartTimeRef.current = Date.now();
      animationFrameId = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [activeAlert, currentDuration]);

  // OBS-safe autoplay: start muted, then unmute after play() resolves
  const handleCanPlay = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const vid = e.currentTarget;
      const durationMs = vid.duration * 1000;

      if (durationMs && isFinite(durationMs)) {
        onVideoLoadedMetadataRef.current?.(durationMs);
      }

      // Muted autoplay strategy — works in OBS browser source
      vid.muted = true;
      vid
        .play()
        .then(() => {
          if (!embedMode) {
            vid.muted = false; // restore audio in OBS full-overlay mode
          }
        })
        .catch((err) => console.warn("[Video] autoplay failed:", err));
    },
    [embedMode]
  );

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    if (!embedMode) {
      controlsHideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [embedMode]);

  const togglePause = useCallback(() => {
    if (!activeAlert) return;
    const nowPaused = !isPausedRef.current;
    isPausedRef.current = nowPaused;

    if (nowPaused) {
      pausedRemainingRef.current = Math.max(1000, timeoutEndRef.current - Date.now());
      extendCurrentTimeoutRef.current?.(3600000);
      if (activeVideoRef.current) {
        activeVideoRef.current.pause();
      } else if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          /* ignore */
        }
      }
    } else {
      const remaining = pausedRemainingRef.current || 5000;
      extendCurrentTimeoutRef.current?.(remaining);
      alertStartTimeRef.current = Date.now() - (currentDuration - remaining);
      if (activeVideoRef.current) {
        activeVideoRef.current.play().catch(() => {});
      } else if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.playVideo();
        } catch {
          /* ignore */
        }
      }
    }
    setIsPaused(nowPaused);
  }, [activeAlert, currentDuration]);

  const seekVideo = useCallback(
    (seconds: number) => {
      if (!activeAlert) return;
      const video = activeVideoRef.current;
      if (video && isFinite(video.duration)) {
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
      } else if (ytPlayerRef.current) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime?.() || 0;
          ytPlayerRef.current.seekTo?.(Math.max(0, cur + seconds), true);
        } catch {
          /* ignore */
        }
      }
    },
    [activeAlert]
  );

  // Keep refs in sync so keyboard handler (declared earlier) can call latest versions
  useEffect(() => {
    togglePauseRef.current = togglePause;
    seekVideoRef.current = seekVideo;
  }, [togglePause, seekVideo]);

  const handleProgressBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeAlert) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const video = activeVideoRef.current;
      if (video && isFinite(video.duration)) {
        // Bar is full-to-empty (1→0), so ratio at click = remaining fraction → seek to (1-ratio) of duration
        video.currentTime = video.duration * (1 - ratio);
      } else {
        const newRemaining = Math.max(500, ratio * currentDuration);
        extendCurrentTimeoutRef.current?.(newRemaining);
        alertStartTimeRef.current = Date.now() - (currentDuration - newRemaining);
      }
    },
    [activeAlert, currentDuration]
  );

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
        embedMode
          ? "w-full h-full min-h-[280px] sm:min-h-[460px] bg-[#0a0a0f] border border-white/10 rounded-3xl p-1.5 sm:p-6"
          : "w-screen h-screen bg-transparent p-0 m-0"
      } ${!embedMode && activeAlert ? "pointer-events-auto" : !embedMode ? "pointer-events-none" : ""}`}
      style={{ background: embedMode ? undefined : "transparent" }}
      onMouseMove={activeAlert && !embedMode ? showControlsTemporarily : undefined}
    >
      {/* Atmospheric decorations */}
      {embedMode && (
        <>
          <div className="absolute top-6 right-6 w-2 h-2 bg-indigo-400 rounded-full blur-[1px] opacity-65 animate-pulse"></div>
          <div className="absolute bottom-12 left-20 w-1 h-1 bg-purple-400 rounded-full blur-[1px] opacity-45 animate-pulse"></div>
          <div className="absolute top-1/4 left-6 w-1.5 h-1.5 bg-white rounded-full blur-[2px] opacity-35"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-indigo-600/10 blur-[80px] rounded-full pointer-events-none z-0"></div>
        </>
      )}

      {/* Reconnect status indicator */}
      {wsStatus !== "connected" && !embedMode && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-slate-950/90 text-amber-500 border border-amber-500/30 px-3 py-1.5 rounded-full text-xs font-mono select-none animate-pulse">
          <AlertTriangle className="w-4.5 h-4.5" />
          <span>OBS Link: Reconnecting WS...</span>
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
        const isVertical =
          activeAlert &&
          (activeAlert.provider === "tiktok" ||
            activeAlert.provider === "instagram" ||
            activeAlert.mediaUrl.includes("shorts"));
        return (
          <div
            className={`relative z-20 transition-all duration-700 select-none mx-auto ${
              embedMode
                ? `w-full ${isVertical ? "max-w-sm sm:max-w-md" : "max-w-xl sm:max-w-2xl"} p-1 sm:p-8`
                : `w-[100vw] h-[100vh] p-0 flex flex-col overflow-hidden`
            } ${
              activeAlert
                ? "translate-y-0 scale-100 opacity-100 rotate-0 pointer-events-auto"
                : "translate-y-16 scale-90 opacity-0 rotate-1 select-none pointer-events-none"
            }`}
          >
            {activeAlert && (
              <div
                className={`relative flex flex-col text-white overflow-hidden transition-all duration-300 w-full ${!embedMode ? "h-full rounded-none border-none" : "rounded-2xl p-4 sm:p-6 gap-3 sm:gap-4"} ${
                  activeAlert.alertStyle === "glass"
                    ? `bg-white/[0.03] backdrop-blur-2xl shadow-2xl ${!embedMode ? "" : "border border-white/10"}`
                    : activeAlert.alertStyle === "glitch"
                      ? `bg-stone-950 shadow-[4px_4px_0_#ef4444] animate-glitch crt-overlay ${!embedMode ? "" : "border-2 border-cyan-500"}`
                      : activeAlert.alertStyle === "cyberpunk"
                        ? `bg-zinc-950 shadow-[4px_4px_24px_rgba(234,179,8,0.15)] ${!embedMode ? "" : "border-l-4 border-yellow-400 border-t-2 border-r border-b border-zinc-900"} [clip-path:polygon(0_0,95%_0,100%_15px,100%_100%,5%_100%,0_85%)]`
                        : `bg-slate-950/95 relative animate-neon-pulse ${!embedMode ? "" : "border-2"}`
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

                <div
                  className={`relative z-10 flex flex-col ${!embedMode ? "p-4 sm:p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none" : ""}`}
                >
                  <div className={`flex items-center gap-3 ${!embedMode ? "mb-3" : ""}`}>
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
                        Nouveau média d&apos;abonnés
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
                    </div>
                  </div>

                  {(() => {
                    const cleanedText = activeAlert.text
                      ? activeAlert.text.replace(/https?:\/\/[^\s]+/gi, "").trim()
                      : "";
                    if (!cleanedText) return null;
                    return (
                      <p
                        className={`text-xs sm:text-lg text-slate-100 leading-relaxed break-words ${
                          activeAlert.alertStyle === "cyberpunk"
                            ? "font-mono text-[11px] sm:text-sm bg-zinc-900/80 p-2 sm:p-3 rounded border border-zinc-800"
                            : "font-sans font-medium"
                        } ${!embedMode ? "drop-shadow-lg" : ""}`}
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

                  const aspectClass = embedMode
                    ? isVertical
                      ? "aspect-[9/16] w-[auto] max-w-full h-auto max-h-[60vh] sm:max-h-[650px] mx-auto mt-2"
                      : activeAlert.type !== "image" && activeAlert.type !== "link"
                        ? "aspect-video w-full max-h-[75vh] mt-2"
                        : "w-full min-h-[140px] sm:min-h-[220px] max-h-[350px] sm:max-h-[500px] mt-2"
                    : "";

                  return (
                    <div
                      className={`${!embedMode ? "absolute inset-0 z-0 w-[100vw] h-[100vh] flex items-center justify-center overflow-hidden" : "relative rounded-xl mt-2 overflow-hidden bg-black flex items-center justify-center shrink-0 min-w-[280px] sm:min-w-[400px]"} ${aspectClass}`}
                    >
                      {activeAlert.type === "video" ? (
                        <>
                          {/* Blurred ambient background */}
                          {!embedMode && isVertical ? (
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

                          {/* Primary video — OBS autoplay strategy */}
                          <video
                            ref={activeVideoRef}
                            src={activeAlert.mediaUrl}
                            className={
                              !embedMode && isVertical
                                ? "relative h-[90vh] max-w-full object-contain z-10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto"
                                : `w-full h-full block relative z-10 object-contain pointer-events-auto ${embedMode ? "bg-black" : "bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"}`
                            }
                            playsInline
                            // Do NOT set muted here — handleCanPlay starts muted then unmutes
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
                            onPause={() => {
                              if (!isPausedRef.current) {
                                pausedRemainingRef.current = Math.max(1000, timeoutEndRef.current - Date.now());
                                isPausedRef.current = true;
                                setIsPaused(true);
                              }
                              extendCurrentTimeoutRef.current?.(3600000);
                            }}
                            onPlay={() => {
                              if (isPausedRef.current) {
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
                          onMouseEnter={() => {
                            extendCurrentTimeoutRef.current?.(3600000);
                          }}
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
                              className={`w-full h-full border-0 block absolute inset-0 z-0 bg-transparent ${embedMode ? "pointer-events-auto" : "pointer-events-none"}`}
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
                            className={`w-full h-full block relative z-10 object-contain ${embedMode ? "bg-black" : "bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"}`}
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
                {(showControls || embedMode) && (
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

      {embedMode && queue.length > 0 && (
        <div className="absolute bottom-3 left-4 text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded">
          Pending: {queue.length} alert(s)
        </div>
      )}
      {embedMode && !activeAlert && queue.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-500">
          <Tv className="w-10 h-10 mb-2 opacity-30 stroke-1" />
          <span className="text-sm font-medium">Real-time preview: Overlay inactive</span>
          <span className="text-xs text-slate-600 mt-1">Trigger a test simulation below</span>
        </div>
      )}
    </div>
  );
}
