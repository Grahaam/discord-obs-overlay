import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Tv, Bot, Flame, AlertTriangle } from "lucide-react";
import { AlertPayload, Sparkle } from "../types";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export default function OBSOverlayView({ embedMode = false, onQueueChange }: { embedMode?: boolean, onQueueChange?: (queue: AlertPayload[]) => void }) {
  const [queue, setQueue] = useState<AlertPayload[]>([]);
  const [activeAlert, setActiveAlert] = useState<AlertPayload | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, boolean>>({});
  const [particles, setParticles] = useState<Sparkle[]>([]);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const onVideoEndedRef = useRef<(() => void) | null>(null);
  const onVideoErrorRef = useRef<(() => void) | null>(null);
  const onVideoLoadedMetadataRef = useRef<((durationMs: number) => void) | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const alertStartTimeRef = useRef<number>(0);
  const [currentDuration, setCurrentDuration] = useState(8000);
  const cancelCurrentAlertRef = useRef<(() => void) | null>(null);
  const extendCurrentTimeoutRef = useRef<((durationMs: number) => void) | null>(null);

  // Load YouTube API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Handle connection & events
  useEffect(() => {
    // Connect to host socket
    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setWsStatus("connected");
      console.log("🔌 Overlay Socket Connected.");
      socket.emit("get_initial_state");
    });

    socket.on("initial_state", (initialQueue: AlertPayload[]) => {
      console.log("🔌 Received initial state from server:", initialQueue);
      setQueue(initialQueue);
    });

    socket.on("disconnect", () => {
      setWsStatus("disconnected");
      console.log("🔌 Overlay Socket Disconnected.");
    });

    socket.on("connect_error", () => {
      setWsStatus("connecting");
    });

    // Capture incoming discord & simulated alerts
    socket.on("new_alert", (alert: AlertPayload) => {
      setQueue((prev) => {
        // Prevent duplicate alerts if they are already in the queue or being played
        if (prev.some(item => item.id === alert.id)) return prev;
        return [...prev, alert];
      });
    });

    socket.on("force_queue_update", (newQueue: AlertPayload[]) => {
      setQueue(newQueue);
    });

    socket.on("remove_queue_item", (itemId: string) => {
      setQueue((prev) => prev.filter(item => item.id !== itemId));
    });

    socket.on("clear_queue", () => {
      setQueue([]);
    });

    socket.on("skip_alert", () => {
      console.log("[Overlay] Alert stopped by remote shortcut / dashboard");
      if (cancelCurrentAlertRef.current) {
        cancelCurrentAlertRef.current();
      }
    });

    return () => {
      socket.close();
    };
  }, []);

  // Listen to keyboard shortcut to skip/force stop active alerts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeAlert) return;

      const configKey = activeAlert.stopAlertShortcut || "Escape";

      const matchesKey = 
        e.key.toLowerCase() === configKey.toLowerCase() ||
        e.code.toLowerCase() === configKey.toLowerCase() ||
        (configKey.toLowerCase() === "space" && e.key === " ") ||
        (configKey.toLowerCase() === "escape" && e.key === "Escape");

      if (matchesKey) {
        console.log("[Overlay] Alert stopped by keyboard shortcut:", configKey);
        e.preventDefault();
        e.stopPropagation();
        if (cancelCurrentAlertRef.current) {
          cancelCurrentAlertRef.current();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeAlert]);

  // Media preloading
  useEffect(() => {
    queue.forEach((item) => {
      if (preloadedUrls[item.mediaUrl]) return;

      console.log(`⏳ Preloading media resource: ${item.mediaUrl}`);
      if (item.type === "iframe" || item.type === "link") {
        // Embed links and external web views don't need direct Media preloading
        setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
      } else if (item.type === "image") {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.src = item.mediaUrl;
        img.onload = () => {
          setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
          console.log(`[Overlay] Cached Image: ${item.mediaUrl}`);
        };
        img.onerror = () => {
          // Fallback to true so we don't stall standard rendering
          setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
        };
      } else {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.src = item.mediaUrl;
        video.preload = "auto";
        video.muted = true;
        
        video.onloadedmetadata = (e) => {
          const target = e.target as HTMLVideoElement;
          console.log(`[Video Preload Debug] onLoadedMetadata - ID: ${item.id}, videoWidth: ${target.videoWidth}, videoHeight: ${target.videoHeight}`);
        };

        video.oncanplaythrough = (e) => {
          const target = e.target as HTMLVideoElement;
          console.log(`[Video Preload Debug] onCanPlayThrough - ID: ${item.id}, videoWidth: ${target.videoWidth}, videoHeight: ${target.videoHeight}`);
          setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
          console.log(`[Overlay] Cached Video: ${item.mediaUrl}`);
        };
        video.onerror = (e: any) => {
          const target = e.target as HTMLVideoElement;
          const err = target.error;
          console.error(`[Video Preload Debug] onError URL: ${item.mediaUrl.substring(0, 100)}... Code: ${err?.code}, Message: ${err?.message}, networkState: ${target.networkState}`);
          // Fallback
          setPreloadedUrls((prev) => ({ ...prev, [item.mediaUrl]: true }));
        };
      }
    });
  }, [queue, preloadedUrls]);

  // YouTube Player initialization
  useEffect(() => {
    if (!activeAlert || !activeAlert.mediaUrl.includes("youtube.com/embed")) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
      return;
    }

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || !ytPlayerContainerRef.current) {
        setTimeout(initPlayer, 200);
        return;
      }

      // Extract video ID from embed URL
      const match = activeAlert.mediaUrl.match(/\/embed\/([^?]+)/);
      const videoId = match ? match[1] : "";

      console.log(`[YouTube API] Initializing player for video: ${videoId}`);
      ytPlayerRef.current = new window.YT.Player(ytPlayerContainerRef.current, {
        height: "100%",
        width: "100%",
        videoId: videoId,
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
            // YT.PlayerState.ENDED is 0
            if (event.data === 0) {
              console.log("[YouTube API] Video ended. Triggering alert finish.");
              onVideoEndedRef.current?.();
            }
          },
          onError: (event: any) => {
            console.error("[YouTube API] Player error:", event.data);
            onVideoErrorRef.current?.();
          }
        },
      });
    };

    initPlayer();

    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
    };
  }, [activeAlert]);

  // Queue processing
  useEffect(() => {
    if (isPlaying || queue.length === 0) return;

    const runNextAlert = async () => {
      setIsPlaying(true);
      const nextItem = { ...queue[0] };
      
      // Shift item representation
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
      setActiveAlert(nextItem);

      // Wait for state shift
      await new Promise((r) => setTimeout(r, 150));

      // Display alert
      let resolvePromise: (() => void) | null = null;
      const alertDelayPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      let timeoutId: any = null;

      const finishAlert = () => {
        if (timeoutId) clearTimeout(timeoutId);
        onVideoEndedRef.current = null;
        onVideoErrorRef.current = null;
        onVideoLoadedMetadataRef.current = null;
        if (resolvePromise) {
          resolvePromise();
          resolvePromise = null;
        }
      };

      const extendTimeout = (newDurationMs: number) => {
        if (timeoutId) clearTimeout(timeoutId);
        setCurrentDuration(newDurationMs);
        timeoutId = setTimeout(finishAlert, Math.max(newDurationMs, 2000));
      };

      cancelCurrentAlertRef.current = finishAlert;
      extendCurrentTimeoutRef.current = extendTimeout;
      
      let defaultDuration = nextItem.duration || 8000;

      if (nextItem.type === "video") {
        if (nextItem.syncDurationWithMedia) {
          onVideoEndedRef.current = finishAlert;
          onVideoLoadedMetadataRef.current = (durationMs) => {
            setCurrentDuration(durationMs);
            extendCurrentTimeoutRef.current?.(durationMs);
          };
          timeoutId = setTimeout(finishAlert, 300000); // 5 min max fallback
        } else {
          timeoutId = setTimeout(finishAlert, defaultDuration);
        }
        onVideoErrorRef.current = finishAlert;
      } else if ((nextItem.type === "iframe" || nextItem.type === "link") && nextItem.syncDurationWithMedia) {
        if (nextItem.mediaUrl.includes("youtube.com/embed")) {
          onVideoEndedRef.current = finishAlert;
          onVideoErrorRef.current = finishAlert;
          timeoutId = setTimeout(finishAlert, 300000); // 5 min max fallback
        } else {
          // We can't detect when other iframes end reliably without cross-origin postMessage, 
          // so we afford a long timeout (let's say 4 minutes) and rely on the streamer 
          // to manually skip if it ends earlier.
          timeoutId = setTimeout(finishAlert, 240000);
        }
      } else {
        timeoutId = setTimeout(finishAlert, defaultDuration);
      }

      await alertDelayPromise;
      cancelCurrentAlertRef.current = null;

      // Shutdown active alert triggering exit animations
      setActiveAlert(null);
      setParticles([]);

      // Notify server that alert has been played
      if (socketRef.current) {
        socketRef.current.emit("alert_played", nextItem.id);
      }

      // Pause active element safely
      if (activeVideoRef.current) {
        activeVideoRef.current.pause();
      }

      // Allow CSS transitions to play before loading next cue item
      await new Promise((r) => setTimeout(r, 1000));
      setIsPlaying(false);
    };

    runNextAlert();
  }, [queue, isPlaying]);

  useEffect(() => {
    if (onQueueChange) onQueueChange(queue);
  }, [queue, onQueueChange]);

  // Handle active styles inline colors
  const activeGlowColor = activeAlert?.neonColor || "#6366f1";

  // Progress Bar Animation Sync
  useEffect(() => {
    let animationFrameId: number;
    
    const updateProgress = () => {
      if (!activeAlert || !progressBarRef.current) return;
      
      let progress = 0;
      if (activeAlert.type === "video" && activeVideoRef.current && activeAlert.syncDurationWithMedia) {
        const video = activeVideoRef.current;
        if (video.duration) {
           progress = 1 - (video.currentTime / video.duration);
        } else {
           progress = 1;
        }
      } else {
         const elapsed = Date.now() - alertStartTimeRef.current;
         progress = 1 - (elapsed / currentDuration);
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

  return (
    <div 
      className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
        embedMode 
          ? "w-full h-full min-h-[280px] sm:min-h-[460px] bg-[#0a0a0f] border border-white/10 rounded-3xl p-1.5 sm:p-6" 
          : "w-screen h-screen bg-transparent p-0 m-0"
      } ${!embedMode && activeAlert ? "pointer-events-auto" : !embedMode ? "pointer-events-none" : ""}`}
      style={{ background: embedMode ? undefined : "transparent" }}
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
      {/* Status indicator */}
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
                style={{
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
                } as any}
              />
            ))}
          </div>
        </div>
      )}

      {/* Alert Container */}
      {(() => {
        const isVertical = activeAlert && (
          activeAlert.provider === "tiktok" ||
          activeAlert.provider === "instagram" ||
          // YouTube Shorts cached as mp4 keep the original URL as a hint
          activeAlert.mediaUrl.includes("shorts")
        );
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
                : `bg-slate-950/95 relative animate-neon-pulse ${!embedMode ? "" : "border-2"}` // default neon style
            }`}
            style={{
              borderColor: activeAlert.alertStyle === "neon" ? activeAlert.neonColor : undefined,
              "--glow-color": activeAlert.neonColor,
            } as any}
          >
            {/* Style Accent for Cyberpunk Style */}
            {activeAlert.alertStyle === "cyberpunk" && (
              <div className="absolute top-0 right-12 bg-yellow-400 text-zinc-950 font-mono text-[9px] px-2 py-0.5 tracking-wider font-extrabold uppercase">
                ALERT // COM_GATEWAY_IN
              </div>
            )}

            {/* Content Top Overlay for OBS mode */}
            <div className={`relative z-10 flex flex-col ${!embedMode ? "p-4 sm:p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none" : ""}`}>
              {/* Header: User credentials */}
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
                    Nouveau média d'abonnés
                  </span>
                  <span className={`text-lg sm:text-2xl font-black drop-shadow-md tracking-tight truncate ${
                    activeAlert.alertStyle === "cyberpunk" ? "font-mono font-bold text-yellow-400" : "font-sans font-extrabold"
                  }`}>
                    {activeAlert.authorName}
                  </span>
                </div>
              </div>

              {/* Message Alert text block */}
              {(() => {
                const cleanedText = activeAlert.text ? activeAlert.text.replace(/https?:\/\/[^\s]+/gi, '').trim() : "";
                if (!cleanedText) return null;
                return (
                  <p className={`text-xs sm:text-lg text-slate-100 leading-relaxed break-words ${
                    activeAlert.alertStyle === "cyberpunk" ? "font-mono text-[11px] sm:text-sm bg-zinc-900/80 p-2 sm:p-3 rounded border border-zinc-800" : "font-sans font-medium"
                  } ${!embedMode ? "drop-shadow-lg" : ""}`}>
                    {cleanedText}
                  </p>
                );
              })()}
            </div>

            {/* Media Canvas layout frame */}
            {(() => {
              const isVertical =
                activeAlert.provider === "tiktok" ||
                activeAlert.provider === "instagram" ||
                activeAlert.mediaUrl.includes("shorts");

              const aspectClass = embedMode 
                ? (isVertical 
                  ? "aspect-[9/16] w-[auto] max-w-full h-auto max-h-[60vh] sm:max-h-[650px] mx-auto mt-2" 
                  : (activeAlert.type !== "image" && activeAlert.type !== "link" 
                      ? "aspect-video w-full max-h-[75vh] mt-2" 
                      : "w-full min-h-[140px] sm:min-h-[220px] max-h-[350px] sm:max-h-[500px] mt-2"))
                : ""; // OBS mode strictly absolute full size

              return (
              <div className={`${!embedMode ? "absolute inset-0 z-0 w-[100vw] h-[100vh] flex items-center justify-center overflow-hidden" : "relative rounded-xl mt-2 overflow-hidden bg-black flex items-center justify-center shrink-0 min-w-[280px] sm:min-w-[400px]"} ${aspectClass}`}>
                {activeAlert.type === "video" ? (
                <>
                  {/* Blurred ambient background — video element for vertical, blurred video for widescreen */}
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
                  <video
                    ref={activeVideoRef}
                    src={activeAlert.mediaUrl}
                    className={!embedMode && isVertical ? "relative h-[90vh] max-w-full object-contain z-10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto" : `w-full h-full block relative z-10 object-contain pointer-events-auto ${embedMode ? "bg-black" : "bg-transparent drop-shadow-[0_0_2rem_rgba(0,0,0,0.8)]"}`}
                    playsInline
                    controls={!embedMode}
                    muted={embedMode}
                    autoPlay
                    crossOrigin="anonymous"
                    onEnded={() => onVideoEndedRef.current?.()}
                    onError={(e) => {
                      const err = e.currentTarget.error;
                      const rawUrl = activeAlert?.mediaUrl || 'unknown';
                      console.error(`[Media Cache] Video Error: ${err?.message || 'Unknown error'} (Code: ${err?.code}) for URL: ${rawUrl}`);
                      
                      // Single retry logic for cached files or proxy media
                      if (activeAlert && !activeAlert.mediaUrl.includes("retry=1")) {
                        console.log("[Media Cache] Attempting single retry for video...");
                        const retryUrl = activeAlert.mediaUrl + (activeAlert.mediaUrl.includes('?') ? '&' : '?') + 'retry=1';
                        setTimeout(() => {
                           setActiveAlert(prev => prev ? { ...prev, mediaUrl: retryUrl } : prev);
                        }, 1000);
                      } else {
                        console.error("[Media Cache] Video failed after retry. Skipping.");
                        onVideoErrorRef.current?.();
                      }
                    }}
                    onPlay={(e) => {
                      if (activeAlert?.type === "video" && onVideoLoadedMetadataRef.current) {
                         const videoDurationMs = e.currentTarget.duration * 1000;
                         if (videoDurationMs && isFinite(videoDurationMs)) {
                           onVideoLoadedMetadataRef.current(videoDurationMs);
                         }
                      }
                    }}
                    onPause={() => {
                      if (cancelCurrentAlertRef.current && extendCurrentTimeoutRef.current) {
                        // clear the timeout when paused so they can interact as long as they want
                        extendCurrentTimeoutRef.current(3600000); 
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      const videoDurationMs = e.currentTarget.duration * 1000;
                      console.log(`[Video Debug] onLoadedMetadata - videoWidth: ${e.currentTarget.videoWidth}, videoHeight: ${e.currentTarget.videoHeight}, duration: ${videoDurationMs}`);
                      if (videoDurationMs && !isNaN(videoDurationMs) && isFinite(videoDurationMs)) {
                        onVideoLoadedMetadataRef.current?.(videoDurationMs);
                      }
                    }}
                    onCanPlay={(e) => {
                      const videoDurationMs = e.currentTarget.duration * 1000;
                      console.log(`[Video Debug] onCanPlay - videoWidth: ${e.currentTarget.videoWidth}, videoHeight: ${e.currentTarget.videoHeight}, readyState: ${e.currentTarget.readyState}, duration: ${videoDurationMs}`);
                      if (videoDurationMs && !isNaN(videoDurationMs) && isFinite(videoDurationMs)) {
                        onVideoLoadedMetadataRef.current?.(videoDurationMs);
                      }
                      e.currentTarget.play().catch(err => console.error("CanPlay auto play catch:", err));
                    }}
                  />
                </>
              ) : activeAlert.type === "iframe" || activeAlert.type === "link" ? (
                <div 
                  className="w-full h-full relative z-10 flex flex-col pt-0"
                  onMouseEnter={() => {
                    if (extendCurrentTimeoutRef.current) extendCurrentTimeoutRef.current(3600000);
                  }}
                >
                  {activeAlert.mediaUrl.includes("youtube.com/embed") ? (
                    <div ref={ytPlayerContainerRef} className="w-full h-full" />
                  ) : (
                    <iframe
                      src={activeAlert.mediaUrl.includes("twitch.tv") 
                            ? `${activeAlert.mediaUrl}&parent=${window.location.hostname}&autoplay=true` 
                            : activeAlert.mediaUrl}
                      title="Media Embed"
                      className={`w-full h-full border-0 block absolute inset-0 z-0 bg-transparent ${embedMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
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
              {/* Spinning background glow accent for standard neon styles */}
              {activeAlert.alertStyle === "neon" && (
                <div 
                  className="absolute inset-0 opacity-15 filter blur-2xl animate-pulse pointer-events-none z-0"
                  style={{ backgroundColor: activeAlert.neonColor }}
                />
              )}
            </div>
            );
            })()}

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 w-full h-2 bg-slate-950/40 pointer-events-none overflow-hidden z-20">
              <div
                ref={progressBarRef}
                className="h-full rounded-r-full"
                style={{
                  width: "100%",
                  backgroundColor: activeAlert.neonColor,
                  boxShadow: `0 0 10px ${activeAlert.neonColor}`
                }}
              />
            </div>
          </div>
        )}
      </div>
      );
      })()}

      {/* Simple debug background label for the web dashboard preview */}
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

