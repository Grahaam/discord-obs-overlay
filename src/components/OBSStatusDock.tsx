import { useState, useEffect } from "react";
import { Bot, Activity, AlertTriangle, RefreshCw } from "lucide-react";
import { LogEntry, BotStatus } from "../types";
import { useQueueStore } from "../store/queueStore";

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

  useEffect(() => {
    const { socketRef } = useQueueStore.getState();
    const socket = socketRef.current;

    if (!socket) {
      console.warn("[OBSStatusDock] Socket not initialized in queue store");
      return;
    }

    const fetchInitial = async () => {
      try {
        const [botRes, logRes] = await Promise.all([fetch("/api/bot-status"), fetch("/api/logs")]);
        if (botRes.ok) setBotStatus(await botRes.json());
        if (logRes.ok) setLogs(await logRes.json());
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

    // Note: We do NOT disconnect the socket on unmount - it's owned by the queue store
    return () => {
      socket.off("bot_status_update");
      socket.off("initial_logs");
      socket.off("new_log");
      socket.off("logs_cleared");
    };
  }, []);

  const isConnected = botStatus.status === "connected";
  const isConnecting = botStatus.status === "connecting";
  const isError = botStatus.status === "error";

  return (
    <div className="bg-[#07070c] text-white min-h-screen flex flex-col font-sans select-none">
      {/* ── Status bar ── */}
      <div
        className={`px-3 py-2.5 flex items-center gap-2 border-b ${
          isConnected
            ? "bg-emerald-950/50 border-emerald-900/40"
            : isConnecting
              ? "bg-amber-950/40 border-amber-900/30"
              : isError
                ? "bg-red-950/40 border-red-900/30"
                : "bg-[#0c0c14] border-white/[0.06]"
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
            onClick={() => fetch("/api/bot-reconnect", { method: "POST" }).catch(() => {})}
            className="shrink-0 text-white/20 hover:text-white/60 transition"
            title="Reconnecter"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {isError && botStatus.errorMsg && (
        <div className="px-3 py-2 bg-red-950/30 border-b border-red-900/20 text-[9px] font-mono text-red-300/70 truncate">
          {botStatus.errorMsg}
        </div>
      )}

      {/* ── Activity log ── */}
      <div className="sticky top-0 z-10 px-3 py-1.5 bg-[#07070c] border-b border-white/[0.05] flex items-center gap-1.5">
        <Activity className="w-2.5 h-2.5 text-white/15" />
        <span className="text-[9px] font-bold text-white/15 uppercase tracking-widest">Activité</span>
        {logs.length > 0 && <span className="ml-auto text-[9px] font-mono text-white/15">{logs.length}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Activity className="w-5 h-5 text-white/10" />
            <span className="text-[10px] text-white/15">Aucune activité</span>
          </div>
        ) : (
          logs.slice(0, 50).map((log) => (
            <div
              key={log.id}
              className="px-3 py-1.5 flex items-baseline gap-2 border-b border-white/[0.04] hover:bg-white/[0.02] transition"
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
