import { useState, useEffect } from "react";
import { Bot, Activity, AlertTriangle, RefreshCw, RotateCcw, Pause, Play } from "lucide-react";
import { LogEntry, BotStatus, ServerLogEntry } from "../types";
import { useQueueStore } from "../store/queueStore";
import { locales, Language } from "../locales";

const STATUS_DOT: Record<LogEntry["status"], string> = {
  approved: "bg-emerald-400",
  blocked: "bg-red-400",
  censored: "bg-amber-400",
  error: "bg-red-600",
};

const STATUS_TEXT: Record<LogEntry["status"], string> = {
  approved: "text-emerald-400/80",
  blocked: "text-red-400/80",
  censored: "text-amber-400/80",
  error: "text-red-400/80",
};

export default function OBSStatusDock() {
  const [botStatus, setBotStatus] = useState<BotStatus>({ status: "disconnected", botUser: "", errorMsg: "" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);
  const [t, setT] = useState(locales["fr"]);

  useEffect(() => {
    const { socketRef } = useQueueStore.getState();
    const socket = socketRef.current;

    if (!socket) {
      console.warn("[OBSStatusDock] Socket not initialized in queue store");
      return;
    }

    const fetchInitial = async () => {
      try {
        const [botRes, logRes, srvLogRes, settingsRes] = await Promise.all([
          fetch("/api/bot-status"),
          fetch("/api/logs"),
          fetch("/api/server-logs"),
          fetch("/api/settings"),
        ]);
        if (botRes.ok) setBotStatus(await botRes.json());
        if (logRes.ok) setLogs(await logRes.json());
        if (srvLogRes.ok) setServerLogs(await srvLogRes.json());
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          const lang = s.language as Language;
          setT(locales[lang] ?? locales["fr"]);
        }
      } catch {
        /* ignore */
      }
    };
    fetchInitial();

    socket.on("bot_status_update", (update: Partial<BotStatus>) => setBotStatus((prev) => ({ ...prev, ...update })));
    socket.on("initial_logs", (incoming: LogEntry[]) => setLogs(incoming));
    socket.on("new_log", (log: LogEntry) =>
      setLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [log, ...prev].slice(0, 50)))
    );
    socket.on("logs_cleared", () => setLogs([]));
    socket.on("new_server_log", (log: ServerLogEntry) =>
      setServerLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [log, ...prev].slice(0, 200)))
    );
    socket.on("initial_server_logs", (incoming: ServerLogEntry[]) => setServerLogs(incoming));
    socket.on("server_logs_cleared", () => setServerLogs([]));

    return () => {
      socket.off("bot_status_update");
      socket.off("initial_logs");
      socket.off("new_log");
      socket.off("logs_cleared");
      socket.off("new_server_log");
      socket.off("initial_server_logs");
      socket.off("server_logs_cleared");
    };
  }, []);

  const isConnected = botStatus.status === "connected";
  const isConnecting = botStatus.status === "connecting";
  const isError = botStatus.status === "error";
  const isOverlayPaused = botStatus.overlayPaused ?? false;

  const handleOverlayPause = () => {
    const next = !isOverlayPaused;
    setBotStatus((prev) => ({ ...prev, overlayPaused: next }));
    fetch(next ? "/api/overlay/pause" : "/api/overlay/resume", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { overlayPaused?: boolean } | null) => {
        if (data?.overlayPaused !== undefined) {
          setBotStatus((prev) => ({ ...prev, overlayPaused: data.overlayPaused }));
        }
      })
      .catch(() => {
        setBotStatus((prev) => ({ ...prev, overlayPaused: isOverlayPaused }));
      });
  };

  return (
    <div className="bg-[#07070c] text-white min-h-screen flex flex-col font-sans select-none">
      {/* ── Status bar ── */}
      <div
        className={`px-3 py-2.5 flex items-center gap-2 border-b ${
          isOverlayPaused
            ? "bg-violet-950/50 border-violet-900/40"
            : isConnected
              ? "bg-emerald-950/50 border-emerald-900/40"
              : isConnecting
                ? "bg-amber-950/40 border-amber-900/30"
                : isError
                  ? "bg-red-950/40 border-red-900/30"
                  : "bg-[#0c0c14] border-white/6"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isConnected ? "bg-emerald-400 animate-pulse" : isConnecting ? "bg-amber-400 animate-pulse" : "bg-red-500"
          }`}
        />
        {isError ? (
          <AlertTriangle className="w-3 h-3 shrink-0 text-red-400" />
        ) : (
          <Bot
            className={`w-3 h-3 shrink-0 ${isConnected ? "text-emerald-400" : isConnecting ? "text-amber-400" : "text-white/30"}`}
          />
        )}
        <span
          className={`font-mono font-bold text-[10px] uppercase tracking-widest truncate flex-1 ${
            isConnected
              ? "text-emerald-300"
              : isConnecting
                ? "text-amber-300"
                : isError
                  ? "text-red-300"
                  : "text-white/30"
          }`}
        >
          {isConnected && botStatus.botUser ? botStatus.botUser : botStatus.status.toUpperCase()}
        </span>
        {!isConnected && !isConnecting && (
          <button
            type="button"
            onClick={() => fetch("/api/bot-reconnect", { method: "POST" }).catch(() => {})}
            className="shrink-0 text-white/20 hover:text-white/60 transition"
            title={t.dock.reconnect}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={handleOverlayPause}
          className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold transition border ${
            isOverlayPaused
              ? "bg-violet-600/30 border-violet-500/40 text-violet-300"
              : "bg-white/4 border-white/8 text-white/30 hover:text-white/60"
          }`}
          title={isOverlayPaused ? t.dock.resume : t.dock.pause}
        >
          {isOverlayPaused ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
          <span>{isOverlayPaused ? t.dock.paused : t.dock.pause}</span>
        </button>
      </div>

      {isError && botStatus.errorMsg && (
        <div className="px-3 py-2 bg-red-950/30 border-b border-red-900/20 text-[9px] font-mono text-red-300/70 truncate">
          {botStatus.errorMsg}
        </div>
      )}

      {/* ── System errors section (only when errors exist) ── */}
      {serverLogs.length > 0 && (
        <div className="border-b-2 border-red-900/30">
          <div className="px-3 py-1.5 bg-red-950/20 flex items-center gap-1.5">
            <AlertTriangle className="w-2.5 h-2.5 text-red-400/70" />
            <span className="text-[9px] font-bold text-red-400/70 uppercase tracking-widest">{t.dock.system}</span>
            <span className="ml-auto bg-red-900/40 text-red-300 text-[8px] font-bold px-1.5 py-0.5 rounded-full">
              {serverLogs.length}
            </span>
          </div>
          {serverLogs.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className="px-3 py-1 flex items-baseline gap-2 border-b border-red-900/10 bg-red-950/10"
            >
              <span className="text-white/20 font-mono shrink-0 tabular-nums text-[9px] leading-4">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span
                className={`shrink-0 text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wide ${
                  log.level === "fatal"
                    ? "bg-red-900/60 text-red-200"
                    : log.level === "error"
                      ? "bg-red-900/40 text-red-300"
                      : "bg-amber-900/40 text-amber-300"
                }`}
              >
                {log.level}
              </span>
              <span className="truncate flex-1 font-mono text-[9px] leading-4 text-red-300/70">{log.msg}</span>
            </div>
          ))}
          {serverLogs.length > 5 && (
            <div className="px-3 py-1 text-[8px] font-mono text-red-400/40 italic">
              +{serverLogs.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* ── Activity log ── */}
      <div className="sticky top-0 z-10 px-3 py-1.5 bg-[#07070c] border-b border-white/[0.05] flex items-center gap-1.5">
        <Activity className="w-2.5 h-2.5 text-white/15" />
        <span className="text-[9px] font-bold text-white/15 uppercase tracking-widest">{t.dock.activity}</span>
        {logs.length > 0 && <span className="ml-auto text-[9px] font-mono text-white/15">{logs.length}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Activity className="w-5 h-5 text-white/10" />
            <span className="text-[10px] text-white/15">{t.dock.noActivity}</span>
          </div>
        ) : (
          logs.slice(0, 50).map((log) => (
            <div
              key={log.id}
              className="group px-3 py-1.5 flex items-baseline gap-2 border-b border-white/4 hover:bg-white/2 transition"
            >
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${STATUS_DOT[log.status] ?? "bg-white/20"}`} />
              <span className="text-white/20 font-mono shrink-0 tabular-nums text-[9px] leading-4">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {log.author && (
                <span className="text-indigo-400/50 shrink-0 font-semibold truncate max-w-[56px] text-[9px] leading-4">
                  {log.author}
                </span>
              )}
              <span
                className={`truncate flex-1 font-mono text-[9px] leading-4 ${STATUS_TEXT[log.status] ?? "text-white/40"}`}
              >
                {log.reason}
              </span>
              {log.mediaUrl && (
                <button
                  type="button"
                  onClick={() =>
                    fetch("/api/replay-alert", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ logId: log.id }),
                    }).catch(() => {})
                  }
                  title="Rejouer"
                  className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-indigo-600/15 border border-indigo-600/20 text-indigo-400/70 hover:bg-indigo-600/35 hover:border-indigo-500/50 hover:text-indigo-200 transition-all opacity-0 group-hover:opacity-100"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
