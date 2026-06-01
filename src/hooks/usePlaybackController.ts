// src/hooks/usePlaybackController.ts
import { useReducer, useEffect, useRef, useCallback, useMemo } from "react";
import type { MutableRefObject } from "react";
import { Socket } from "socket.io-client";
import { AlertPayload, Sparkle } from "../types";

// ─── Playback phase ───────────────────────────────────────────────────────────
// "waiting"    — idle, no alert playing, ready for next
// "preloading" — item dequeued, being set up
// "ready"      — React state updated, awaiting rAF
// "playing"    — timers running, events live
// "finished"   — finishAlert called, awaiting cleanup
type PlaybackPhase = "waiting" | "preloading" | "ready" | "playing" | "finished";

// ─── Reducer state (only what React renders) ──────────────────────────────────
interface QueueState {
  active: AlertPayload | null;
  particles: Sparkle[];
  isPaused: boolean;
  showControls: boolean;
  currentDuration: number;
  volume: number;
}

type QueueAction =
  | { type: "START"; alert: AlertPayload; particles: Sparkle[]; duration: number }
  | { type: "FINISH" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SET_DURATION"; ms: number }
  | { type: "SET_VOLUME"; v: number }
  | { type: "SHOW_CONTROLS" }
  | { type: "HIDE_CONTROLS" }
  | { type: "RETRY_URL"; url: string };

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "START":
      return {
        ...state,
        active: action.alert,
        particles: action.particles,
        currentDuration: action.duration,
        isPaused: false,
        showControls: false,
      };
    case "FINISH":
      return { ...state, active: null, particles: [], isPaused: false, showControls: false };
    case "PAUSE":
      return { ...state, isPaused: true };
    case "RESUME":
      return { ...state, isPaused: false };
    case "SET_DURATION":
      return { ...state, currentDuration: action.ms };
    case "SET_VOLUME":
      return { ...state, volume: action.v };
    case "SHOW_CONTROLS":
      return { ...state, showControls: true };
    case "HIDE_CONTROLS":
      return { ...state, showControls: false };
    case "RETRY_URL":
      return state.active ? { ...state, active: { ...state.active, mediaUrl: action.url } } : state;
    default:
      return state;
  }
}

// ─── Initial volume from localStorage ─────────────────────────────────────────
const INITIAL_VOLUME = (() => {
  try {
    const saved = localStorage.getItem("overlay_volume");
    if (saved !== null) return Math.max(0, Math.min(1, parseFloat(saved)));
  } catch {
    /* localStorage may be blocked in OBS browser source */
  }
  return 1;
})();

const INITIAL_STATE: QueueState = {
  active: null,
  particles: [],
  isPaused: false,
  showControls: false,
  currentDuration: 8000,
  volume: INITIAL_VOLUME,
};

// ─── Helper: generate sparkle particles ───────────────────────────────────────
function generateParticles(neonColor: string): Sparkle[] {
  const colors = [neonColor, "#ffffff", "#fbcfe8", "#c7d2fe"];
  return Array.from({ length: 40 }, (_, i) => ({
    id: i,
    dx: `${(Math.random() * 300 - 150).toFixed(0)}px`,
    dy: `${(Math.random() * -240 - 60).toFixed(0)}px`,
    size: `${(Math.random() * 10 + 4).toFixed(0)}px`,
    delay: `${(Math.random() * 1.2).toFixed(2)}s`,
    dur: `${(Math.random() * 2 + 1.2).toFixed(2)}s`,
    bg: colors[Math.floor(Math.random() * colors.length)],
  }));
}

// ─── Hook props ───────────────────────────────────────────────────────────────
export interface UsePlaybackControllerProps {
  queue: AlertPayload[];
  setQueue: React.Dispatch<React.SetStateAction<AlertPayload[]>>;
  queueRef: MutableRefObject<AlertPayload[]>;
  socketRef: MutableRefObject<Socket | null>;
  activeAlertRef: MutableRefObject<AlertPayload | null>;
  isLeader: boolean;
}

export function usePlaybackController({
  queue,
  setQueue,
  queueRef,
  socketRef,
  activeAlertRef,
  isLeader,
}: UsePlaybackControllerProps) {
  const [state, dispatch] = useReducer(queueReducer, INITIAL_STATE);
  const { active, particles, isPaused, showControls, currentDuration, volume } = state;

  // ── Internal refs — never returned ──────────────────────────────────────────
  const phaseRef = useRef<PlaybackPhase>("waiting");
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isLeaderRef = useRef(isLeader);
  const isPausedRef = useRef(false);
  const isBufferingRef = useRef(false);
  const pausedRemainingRef = useRef(0);
  const lastEmitTimeRef = useRef(0);
  const timeoutEndRef = useRef(0);
  const alertStartTimeRef = useRef(0);
  const preloadedUrlsRef = useRef<Set<string>>(new Set());
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-alert callbacks — set inside runNextAlert, cleared by finishAlert
  const onVideoEndedRef = useRef<(() => void) | null>(null);
  const onVideoErrorRef = useRef<(() => void) | null>(null);
  const onVideoLoadedMetaRef = useRef<((ms: number) => void) | null>(null);
  const extendTimeoutRef = useRef<((ms: number) => void) | null>(null);
  const cancelAlertRef = useRef<(() => void) | null>(null);
  // Stable ref wrappers for keyboard handler (captures once, stays up-to-date)
  const togglePauseRef = useRef<() => void>(() => {});
  const seekVideoRef = useRef<(s: number) => void>(() => {});
  // Always-current copies of state values for use inside stable memoized closures
  const currentDurationRef = useRef(INITIAL_STATE.currentDuration);
  const volumeRef = useRef(INITIAL_VOLUME);
  // Video retry count — reset per alert
  const videoRetryCountRef = useRef(0);

  // FIX 2: Update refs inside useEffect, not during render
  useEffect(() => {
    currentDurationRef.current = currentDuration;
    volumeRef.current = volume;
  }, [currentDuration, volume]);

  useEffect(() => {
    activeAlertRef.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    isLeaderRef.current = isLeader;
    if (isLeader && phaseRef.current === "waiting" && queueRef.current.length > 0) {
      // eslint-disable-next-line react-hooks/immutability
      runNextAlert();
    }
    // runNextAlert is stable (useCallback []) — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader]);

  // ── Preload next 2 queue items ───────────────────────────────────────────────
  useEffect(() => {
    const preloaded = preloadedUrlsRef.current;
    const upcoming = new Set(queue.slice(0, 2).map((i) => i.mediaUrl));
    for (const url of preloaded) {
      if (!upcoming.has(url)) preloaded.delete(url);
    }
    queue.slice(0, 2).forEach((item) => {
      if (preloaded.has(item.mediaUrl)) return;
      if (item.type === "iframe" || item.type === "link") {
        preloaded.add(item.mediaUrl);
        return;
      }
      if (item.type === "image") {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.src = item.mediaUrl;
        img.onload = img.onerror = () => preloaded.add(item.mediaUrl);
        return;
      }
      const video = document.createElement("video");
      video.src = item.mediaUrl;
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.oncanplaythrough = video.onerror = () => preloaded.add(item.mediaUrl);
    });
  }, [queue]);

  // ── Progress bar — rAF driven, no setState ───────────────────────────────────
  useEffect(() => {
    let rafId: number;
    const update = () => {
      if (!active || !progressBarRef.current) return;
      if (isPausedRef.current && !(active.type === "video" && active.syncDurationWithMedia)) {
        rafId = requestAnimationFrame(update);
        return;
      }
      let progress: number;
      if (active.type === "video" && activeVideoRef.current && active.syncDurationWithMedia) {
        const v = activeVideoRef.current;
        progress = v.duration ? 1 - v.currentTime / v.duration : 1;
      } else {
        progress = 1 - (Date.now() - alertStartTimeRef.current) / currentDurationRef.current;
      }
      progress = Math.max(0, Math.min(1, progress));
      progressBarRef.current.style.width = `${progress * 100}%`;
      if (progress > 0) rafId = requestAnimationFrame(update);
    };
    if (active) {
      alertStartTimeRef.current = Date.now();
      rafId = requestAnimationFrame(update);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [active]); // currentDuration read via ref — no dep needed

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      const configKey = (active.stopAlertShortcut || "Escape").toLowerCase();
      const isSpace = e.key === " " || e.code === "Space";
      const matchesStop =
        e.key.toLowerCase() === configKey ||
        e.code.toLowerCase() === configKey ||
        (configKey === "space" && isSpace) ||
        (configKey === "escape" && e.key === "Escape");
      if (matchesStop) {
        e.preventDefault();
        e.stopPropagation();
        cancelAlertRef.current?.();
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
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  // ── Core async playback loop ─────────────────────────────────────────────────
  const runNextAlert = useCallback(async () => {
    if (!isLeaderRef.current || phaseRef.current !== "waiting" || queueRef.current.length === 0) return;

    phaseRef.current = "preloading";
    // FIX 3: Reset video retry count at the start of each alert
    videoRetryCountRef.current = 0;
    const item = { ...queueRef.current[0] };
    setQueue((prev) => prev.slice(1));

    // Drop non-embeddable links (yt-dlp failed to download)
    const NON_EMBEDDABLE = ["youtube.com/watch", "youtu.be/", "twitter.com/", "x.com/", "instagram.com/p/"];
    if (item.type === "link" && NON_EMBEDDABLE.some((p) => item.mediaUrl.includes(p))) {
      console.warn(`[Overlay] Skipping non-embeddable link: ${item.mediaUrl}`);
      socketRef.current?.emit("alert_played", item.id);
      phaseRef.current = "waiting";
      return;
    }

    const defaultDuration = item.duration || 8000;
    phaseRef.current = "ready";
    dispatch({ type: "START", alert: item, particles: generateParticles(item.neonColor), duration: defaultDuration });
    socketRef.current?.emit("alert_started", item.id);

    // Let React flush the DOM before binding media events
    await new Promise((r) => requestAnimationFrame(r));

    if (item.alertSoundUrl) {
      try {
        new Audio(item.alertSoundUrl).play().catch(() => {});
      } catch {
        /* ignore */
      }
    }

    phaseRef.current = "playing";

    // ── Per-alert finish machinery ───────────────────────────────────────────
    let resolveFinish: (() => void) | null = null;
    const finishPromise = new Promise<void>((r) => {
      resolveFinish = r;
    });
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finishAlert = (_reason = "unknown") => {
      if (phaseRef.current === "finished" || phaseRef.current === "waiting") return;
      phaseRef.current = "finished";
      if (timeoutId) clearTimeout(timeoutId);
      // Clear all per-alert refs — stale events after this point are no-ops
      onVideoEndedRef.current = null;
      onVideoErrorRef.current = null;
      onVideoLoadedMetaRef.current = null;
      extendTimeoutRef.current = null;
      cancelAlertRef.current = null;
      resolveFinish?.();
      resolveFinish = null;
    };

    const extendTimeout = (ms: number) => {
      if (timeoutId) clearTimeout(timeoutId);
      dispatch({ type: "SET_DURATION", ms });
      const clamped = Math.max(ms, 2000);
      timeoutEndRef.current = Date.now() + clamped;
      timeoutId = setTimeout(() => finishAlert("timeout"), clamped);
    };

    cancelAlertRef.current = finishAlert;
    extendTimeoutRef.current = extendTimeout;

    // ── Set initial timer based on media type ────────────────────────────────
    if (item.type === "video") {
      if (item.syncDurationWithMedia) {
        onVideoEndedRef.current = () => finishAlert("video-ended");
        onVideoLoadedMetaRef.current = (ms) => extendTimeoutRef.current?.(ms);
        timeoutEndRef.current = Date.now() + 300_000;
        timeoutId = setTimeout(() => finishAlert("timeout-5min-cap"), 300_000);
      } else {
        timeoutEndRef.current = Date.now() + defaultDuration;
        timeoutId = setTimeout(() => finishAlert("timeout-fixed"), defaultDuration);
      }
      onVideoErrorRef.current = () => finishAlert("video-error");
    } else if ((item.type === "iframe" || item.type === "link") && item.syncDurationWithMedia) {
      // All iframe/link types use the same timeout (including youtube.com/embed)
      timeoutEndRef.current = Date.now() + 240_000;
      timeoutId = setTimeout(() => finishAlert("timeout-iframe"), 240_000);
    } else {
      timeoutEndRef.current = Date.now() + defaultDuration;
      timeoutId = setTimeout(() => finishAlert("timeout-default"), defaultDuration);
    }

    await finishPromise;

    // ── Cleanup ──────────────────────────────────────────────────────────────
    isPausedRef.current = false;
    if (activeVideoRef.current) activeVideoRef.current.pause();
    dispatch({ type: "FINISH" });
    socketRef.current?.emit("alert_played", item.id);

    // Wait for CSS exit transition (800ms)
    await new Promise((r) => setTimeout(r, 800));

    phaseRef.current = "waiting";
    if (isLeaderRef.current && queueRef.current.length > 0) runNextAlert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger on queue change (e.g., new alert arrives while idle)
  useEffect(() => {
    if (!activeAlertRef.current && queue.length > 0 && phaseRef.current === "waiting") {
      runNextAlert();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, runNextAlert]);

  // ── videoHandlers — spread onto <video ref={activeVideoRef} {...videoHandlers} /> ──
  // All internal refs; stable across renders (empty deps array is intentional).
  const videoHandlers = useMemo(
    () => ({
      onEnded: () => onVideoEndedRef.current?.(),

      onError: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const err = e.currentTarget.error;
        const url = activeAlertRef.current?.mediaUrl ?? "unknown";
        console.error(`[Video] Error code ${err?.code}: ${err?.message} — ${url}`);
        // FIX 3: Use ref-based retry counter instead of URL mutation
        if (activeAlertRef.current && videoRetryCountRef.current < 1) {
          videoRetryCountRef.current += 1;
          setTimeout(() => dispatch({ type: "RETRY_URL", url: activeAlertRef.current!.mediaUrl }), 1000);
        } else {
          onVideoErrorRef.current?.();
        }
      },

      onCanPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const vid = e.currentTarget;
        // OBS browser source autoplay: mute then immediately unmute
        vid.muted = true;
        vid.muted = false;
        vid.volume = volumeRef.current;
      },

      onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const ms = e.currentTarget.duration * 1000;
        if (ms && isFinite(ms)) onVideoLoadedMetaRef.current?.(ms);
      },

      onPause: () => {
        // Guard: only process genuine in-playback pauses
        if (phaseRef.current !== "playing" || isBufferingRef.current) return;
        if (!isPausedRef.current) {
          pausedRemainingRef.current = Math.max(1000, timeoutEndRef.current - Date.now());
          isPausedRef.current = true;
          dispatch({ type: "PAUSE" });
        }
        extendTimeoutRef.current?.(3_600_000);
      },

      onPlay: () => {
        // Guard: drop stale events during cleanup or preload phases
        if (phaseRef.current !== "playing" || !isPausedRef.current || isBufferingRef.current) return;
        const remaining = pausedRemainingRef.current || 5000;
        extendTimeoutRef.current?.(remaining);
        alertStartTimeRef.current = Date.now() - (currentDurationRef.current - remaining);
        isPausedRef.current = false;
        dispatch({ type: "RESUME" });
      },

      onWaiting: () => {
        isBufferingRef.current = true;
      },
      onPlaying: () => {
        isBufferingRef.current = false;
        // emit a playback update when playback resumes
        try {
          socketRef.current?.emit("playback_state", {
            isPaused: false,
            currentTime: activeVideoRef.current?.currentTime ?? 0,
            duration: activeVideoRef.current?.duration ?? currentDurationRef.current,
            volume: volumeRef.current,
          });
        } catch {
          /* ignore */
        }
      },
      onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const now = Date.now();
        if (now - lastEmitTimeRef.current < 500) return; // throttle to 500ms
        lastEmitTimeRef.current = now;
        const vid = e.currentTarget;
        try {
          socketRef.current?.emit("playback_state", {
            currentTime: vid.currentTime,
            duration: isFinite(vid.duration) ? vid.duration : undefined,
            isPaused: isPausedRef.current,
            volume: volumeRef.current,
          });
        } catch {
          /* ignore */
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // all access via refs — stable across renders
  );

  // ── Action callbacks ──────────────────────────────────────────────────────────

  const togglePause = useCallback(() => {
    if (!activeAlertRef.current) return;
    const nowPaused = !isPausedRef.current;
    isPausedRef.current = nowPaused;
    if (nowPaused) {
      pausedRemainingRef.current = Math.max(1000, timeoutEndRef.current - Date.now());
      extendTimeoutRef.current?.(3_600_000);
      if (activeVideoRef.current) activeVideoRef.current.pause();
    } else {
      const remaining = pausedRemainingRef.current || 5000;
      extendTimeoutRef.current?.(remaining);
      alertStartTimeRef.current = Date.now() - (currentDurationRef.current - remaining);
      if (activeVideoRef.current) activeVideoRef.current.play().catch(() => {});
    }
    dispatch(nowPaused ? { type: "PAUSE" } : { type: "RESUME" });
    // Notify server/other clients of pause/resume
    try {
      socketRef.current?.emit("playback_state", {
        isPaused: nowPaused,
        currentTime: activeVideoRef.current?.currentTime ?? 0,
        duration: activeVideoRef.current?.duration ?? currentDurationRef.current,
        volume: volumeRef.current,
      });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seekVideo = useCallback((seconds: number) => {
    if (!activeAlertRef.current) return;
    const video = activeVideoRef.current;
    if (video && isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
      lastEmitTimeRef.current = Date.now();
      try {
        socketRef.current?.emit("playback_state", { currentTime: video.currentTime, duration: video.duration });
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seekAbsolute = useCallback((seconds: number) => {
    if (!activeAlertRef.current) return;
    const video = activeVideoRef.current;
    if (video && isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(video.duration, seconds));
      lastEmitTimeRef.current = Date.now();
      try {
        socketRef.current?.emit("playback_state", { currentTime: video.currentTime, duration: video.duration });
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      volumeRef.current = v;
      dispatch({ type: "SET_VOLUME", v });
      if (activeVideoRef.current) activeVideoRef.current.volume = v;
      try {
        localStorage.setItem("overlay_volume", String(v));
      } catch {
        /* ignore */
      }
      try {
        socketRef.current?.emit("playback_state", { volume: v });
      } catch {
        /* ignore */
      }
    },
    [socketRef]
  );

  const showControlsTemporarily = useCallback(() => {
    dispatch({ type: "SHOW_CONTROLS" });
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = setTimeout(() => dispatch({ type: "HIDE_CONTROLS" }), 3000);
  }, []);

  const handleProgressBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeAlertRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const video = activeVideoRef.current;
    if (video && isFinite(video.duration)) {
      // Bar is full-to-empty (1→0): click ratio = remaining fraction
      video.currentTime = video.duration * (1 - ratio);
    } else {
      const newRemaining = Math.max(500, ratio * currentDurationRef.current);
      extendTimeoutRef.current?.(newRemaining);
      alertStartTimeRef.current = Date.now() - (currentDurationRef.current - newRemaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseEnterMedia = useCallback(() => {
    extendTimeoutRef.current?.(3_600_000);
  }, []);

  const cancelCurrentAlert = useCallback(() => {
    cancelAlertRef.current?.();
  }, []);

  // Keep stable refs in sync so keyboard handler (captures once) calls latest versions
  useEffect(() => {
    togglePauseRef.current = togglePause;
    seekVideoRef.current = seekVideo;
  }, [togglePause, seekVideo]);

  // ── Return ────────────────────────────────────────────────────────────────────
  return {
    active,
    particles,
    isPaused,
    showControls,
    volume,
    progressBarRef,
    activeVideoRef,
    ytPlayerContainerRef,
    videoHandlers,
    togglePause,
    seekVideo,
    seekAbsolute,
    setVolume,
    handleProgressBarClick,
    onMouseEnterMedia,
    showControlsTemporarily,
    cancelCurrentAlert,
  };
}
