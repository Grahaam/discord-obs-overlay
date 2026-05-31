import { useState, useEffect } from "react";
import { TabProps } from "./types";
import { Bot, HardDrive, Cpu, Video as VideoIcon, Activity, Trash2, Check } from "lucide-react";

function StatBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function barColor(pct: number) {
  if (pct > 80) return "bg-rose-500";
  if (pct > 55) return "bg-amber-400";
  return "bg-cyan-400";
}

export default function HealthTab(props: TabProps) {
  const { botStatus, t } = props;

  const [localCacheBytes, setLocalCacheBytes] = useState(0);
  const [localCacheFiles, setLocalCacheFiles] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (botStatus?.health?.cache) {
      setLocalCacheBytes(botStatus.health.cache.size ?? 0);
      setLocalCacheFiles(botStatus.health.cache.files ?? 0);
    }
    setLastRefreshed(new Date());
  }, [botStatus]);

  if (botStatus === undefined || t === undefined) return null;

  const isConnected = botStatus.status === "connected";
  const cpuLoad = botStatus.health?.system.cpu ?? 0;
  const memUsed = botStatus.health?.system.memory.used ?? 0;
  const memTotal = botStatus.health?.system.memory.total ?? 1;
  const CACHE_MAX = 2 * 1024 * 1024 * 1024;

  const cpuPct = Math.min((cpuLoad / 4) * 100, 100);
  const memPct = Math.min((memUsed / memTotal) * 100, 100);
  const cachePct = Math.min((localCacheBytes / CACHE_MAX) * 100, 100);

  async function handleClearCache() {
    if (clearing) return;
    setClearing(true);
    try {
      await fetch("/api/cache/clear", { method: "POST" });
      setLocalCacheBytes(0);
      setLocalCacheFiles(0);
      setCleared(true);
      setTimeout(() => setCleared(false), 2500);
    } finally {
      setClearing(false);
    }
  }

  const refreshedTime = lastRefreshed
    ? lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold font-mono text-white tracking-wider uppercase">{t.health.title}</h2>
          <p className="text-[10px] text-white/30 mt-0.5 font-mono">{t.health.desc}</p>
        </div>
      </div>

      {/* Bot Status — full-width accent card */}
      <div
        className={`relative rounded-xl border p-4 overflow-hidden ${
          isConnected ? "border-emerald-500/25 bg-emerald-950/10" : "border-rose-500/25 bg-rose-950/10"
        }`}
      >
        <div
          className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full ${isConnected ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        <div className="flex items-center justify-between pl-2">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-white/50" />
            <span className="text-xs font-mono text-white/60 uppercase tracking-wider">{t.health.botStatus}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${
                isConnected ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" : "bg-rose-500/15 text-rose-300 border border-rose-500/25"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}
              />
              {botStatus.status}
            </span>
          </div>
        </div>
        {botStatus.botUser && (
          <p className="text-[10px] font-mono text-white/30 mt-2 pl-2">
            <span className="text-white/20">user: </span>{botStatus.botUser}
          </p>
        )}
        {botStatus.errorMsg && (
          <p className="text-[10px] font-mono text-rose-300/60 mt-1.5 pl-2 break-all">{botStatus.errorMsg}</p>
        )}
      </div>

      {/* System stats — 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* CPU */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{t.health.systemStats}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-mono text-white/35">{t.health.cpuUsage}</span>
                <span className="text-[10px] font-mono text-white/60">{cpuLoad.toFixed(2)}<span className="text-white/25"> avg</span></span>
              </div>
              <StatBar value={cpuPct} max={100} colorClass={barColor(cpuPct)} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-mono text-white/35">{t.health.memoryUsed}</span>
                <span className="text-[10px] font-mono text-white/60">
                  {(memUsed / (1024 ** 3)).toFixed(1)}
                  <span className="text-white/25"> / {(memTotal / (1024 ** 3)).toFixed(1)} GB</span>
                </span>
              </div>
              <StatBar value={memPct} max={100} colorClass={barColor(memPct)} />
            </div>
          </div>
        </div>

        {/* Cache */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{t.health.cacheStats}</span>
            </div>
            {refreshedTime && (
              <span className="text-[9px] font-mono text-white/20">
                {t.health.lastRefreshed} {refreshedTime}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-mono text-white/35">{t.health.cacheSize}</span>
                <span className="text-[10px] font-mono text-white/60">
                  {(localCacheBytes / (1024 ** 2)).toFixed(1)}
                  <span className="text-white/25"> / 2048 MB</span>
                </span>
              </div>
              <StatBar value={cachePct} max={100} colorClass={barColor(cachePct)} />
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-white/[0.05]">
              <span className="text-[10px] font-mono text-white/35">{t.health.cacheFiles}</span>
              <span className="text-xs font-mono font-bold text-white/70">
                {localCacheFiles}
                <span className="text-[10px] font-normal text-white/25"> files</span>
              </span>
            </div>
            <div className="flex justify-end pt-0.5">
              <button
                onClick={handleClearCache}
                disabled={clearing}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all duration-200 ${
                  cleared
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-300/70 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/30"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {cleared ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                {cleared ? t.health.cacheCleared : t.health.clearCache}
              </button>
            </div>
          </div>
        </div>

        {/* yt-dlp */}
        <div className="md:col-span-2 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{t.health.ytdlpStatus}</span>
          </div>
          <span className="text-[11px] font-mono text-white/50 bg-white/[0.04] border border-white/[0.07] rounded-md px-2.5 py-1 truncate max-w-[60%]">
            {botStatus.health?.ytdlp ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
