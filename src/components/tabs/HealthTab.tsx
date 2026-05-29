import { TabProps } from "./types";
import { Bot, HardDrive, Cpu, Video as VideoIcon } from "lucide-react";

export default function HealthTab(props: TabProps) {
  const { botStatus, t } = props;
  if (botStatus === undefined || t === undefined) return null;
  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="border-b border-white/10 pb-3">
        <h2 className="text-lg font-bold font-display text-white">{t.health.title}</h2>
        <p className="text-xs text-white/40 mt-1">{t.health.desc}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`p-4 rounded-xl border flex flex-col gap-2 ${botStatus.status === "connected" ? "bg-emerald-950/30 border-emerald-900/60" : "bg-rose-950/30 border-rose-900/60"}`}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4" /> {t.health.botStatus}
          </h3>
          <p className={`text-xs font-mono ${botStatus.status === "connected" ? "text-emerald-400" : "text-rose-400"}`}>
            {botStatus.status.toUpperCase()}
          </p>
          {botStatus.errorMsg && <p className="text-xs text-rose-300 break-all">{botStatus.errorMsg}</p>}
          {botStatus.botUser && (
            <p className="text-xs text-white/70">
              {t.health.botUser}: {botStatus.botUser}
            </p>
          )}
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4" /> {t.health.cacheStats}
          </h3>
          <p className="text-xs text-white/70">
            {t.health.cacheSize}: {((botStatus.health?.cache.size ?? 0) / (1024 * 1024)).toFixed(2)} MB
          </p>
          <p className="text-xs text-white/70">
            {t.health.cacheFiles}: {botStatus.health?.cache.files}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4" /> {t.health.systemStats}
          </h3>
          <p className="text-xs text-white/70">
            {t.health.cpuUsage}: {botStatus.health?.system.cpu.toFixed(2)} (1m avg)
          </p>
          <p className="text-xs text-white/70">
            {t.health.memoryUsed}: {((botStatus.health?.system.memory.used ?? 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
          </p>
          <p className="text-xs text-white/70">
            {t.health.memoryTotal}: {((botStatus.health?.system.memory.total ?? 0) / (1024 * 1024 * 1024)).toFixed(2)}{" "}
            GB
          </p>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <VideoIcon className="w-4 h-4" /> {t.health.ytdlpStatus}
          </h3>
          <p className="text-xs font-mono text-white/70">{botStatus.health?.ytdlp}</p>
        </div>
      </div>
    </div>
  );
}
