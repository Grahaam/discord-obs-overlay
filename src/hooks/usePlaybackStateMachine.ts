import { useState, useEffect, useRef, useCallback } from "react";
import { Socket } from "socket.io-client";
import { AlertPayload, Sparkle } from "../types";
import { Language } from "../locales";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

// Deterministic playback states — no arbitrary timeouts drive transitions.
type PlaybackState = "waiting" | "preloading" | "ready" | "playing" | "finished" | "failed";

interface UsePlaybackStateMachineProps {
  queue: AlertPayload[];
  setQueue: React.Dispatch<React.SetStateAction<AlertPayload[]>>;
  queueRef: React.MutableRefObject<AlertPayload[]>;
  socketRef: React.MutableRefObject<Socket | null>;
  language: Language;
}

export function usePlaybackStateMachine(props: UsePlaybackStateMachineProps) {
  const { queue, setQueue, queueRef, socketRef } = props;

  const [activeAlert, setActiveAlert] = useState<AlertPayload | null>(null);
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, boolean>>({});
  const [particles, setParticles] = useState<Sparkle[]>([]);
  const [currentDuration, setCurrentDuration] = useState(8000);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("overlay_volume");
      if (saved !== null) return Math.max(0, Math.min(1, parseFloat(saved)));
    } catch {}
    return 1;
  });

  // Refs that don't cause rerenders — critical for OBS performance
  const playbackStateRef = useRef<PlaybackState>("waiting");
  const activeAlertRef = useRef<AlertPayload | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const onVideoEndedRef = useRef<(() => void) | null>(null);
  const onVideoErrorRef = useRef<(() => void) | null>(null);
  const onVideoLoadedMetadataRef = useRef<((durationMs: number) => void) | null>(null);
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
      try {
        const first = document.getElementsByTagName("script")[0];
        if (first?.parentNode) {
          first.parentNode.insertBefore(tag, first);
        } else {
          document.head.appendChild(tag);
        }
      } catch {
        document.head.appendChild(tag);
      }
    }
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
    queue.slice(0, 2).forEach((item) => {
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
            try { event.target.setVolume(volume * 100); } catch {}
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
  }, [activeAlert, volume]);

  // Core playback loop — event-driven state machine
  const runNextAlert = useCallback(async () => {
    // Atomic check-and-set to prevent race conditions during rapid queue updates or double-mounting
    if (playbackStateRef.current !== "waiting" || queueRef.current.length === 0) return;
    playbackStateRef.current = "preloading";

    const nextItem = { ...queueRef.current[0] };
    setQueue((prev) => prev.slice(1));

    // Silently drop link-type alerts for platforms that block iframe embedding
    const NON_EMBEDDABLE = ["youtube.com/watch", "youtu.be/", "twitter.com/", "x.com/", "instagram.com/p/"];
    if (nextItem.type === "link" && NON_EMBEDDABLE.some((p) => nextItem.mediaUrl.includes(p))) {
      console.warn(`[Overlay] Skipping non-embeddable link alert (yt-dlp failed): ${nextItem.mediaUrl}`);
      socketRef.current?.emit("alert_played", nextItem.id);
      playbackStateRef.current = "waiting";
      return;
    }

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
    socketRef.current?.emit("alert_started", nextItem.id);

    // Small rAF delay to let React flush DOM before binding events
    await new Promise((r) => requestAnimationFrame(r));

    // Play alert sound if configured
    if (nextItem.alertSoundUrl) {
      try {
        const audio = new Audio(nextItem.alertSoundUrl);
        audio.play().catch(() => {});
      } catch {}
    }

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

    socketRef.current?.emit("alert_played", nextItem.id);

    if (activeVideoRef.current) {
      activeVideoRef.current.pause();
    }

    // CSS exit transition
    await new Promise((r) => setTimeout(r, 800));

    playbackStateRef.current = "waiting";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (playbackStateRef.current === "waiting" && queue.length > 0) {
      runNextAlert();
    }
  }, [queue, runNextAlert]);

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

      // OBS browser source: start muted then immediately unmute for autoplay
      vid.muted = true;
      vid.muted = false;
      vid.volume = volume;
    },
    [volume]
  );

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

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

  return {
    activeAlert,
    setActiveAlert,
    particles,
    isPaused,
    setIsPaused,
    showControls,
    currentDuration,
    preloadedUrls,
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
    pausedRemainingRef,
    timeoutEndRef,
    alertStartTimeRef,
    handleCanPlay,
    showControlsTemporarily,
    togglePause,
    seekVideo,
    handleProgressBarClick,
  };
}
