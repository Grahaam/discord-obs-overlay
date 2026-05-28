import { TabProps } from "./types";
import { Bot, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function BotTab(props: TabProps) {
  const { config, setConfig, botStatus, t } = props;
  if (config === undefined || setConfig === undefined || botStatus === undefined || t === undefined) return null;
  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="border-b border-slate-900 pb-3">
        <h2 className="text-lg font-bold font-display text-white">{t.bot.title}</h2>
        <p className="text-xs text-slate-400 mt-1">{t.bot.desc}</p>
      </div>

      {botStatus.status === "error" && (
        <div className="bg-rose-950/40 text-rose-200 border border-rose-900/60 p-4 rounded-xl flex gap-3 items-start text-xs leading-relaxed animate-pulse">
          <AlertTriangle className="w-5 h-5 stroke-2 shrink-0 text-rose-500 mt-0.5" />
          <div>
            <span className="font-bold block text-sm">{t.bot.error}</span>
            <span className="font-mono mt-0.5 block break-all">{botStatus.errorMsg}</span>
          </div>
        </div>
      )}

      {botStatus.status === "connected" && (
        <div className="bg-emerald-950/30 text-emerald-300 border border-emerald-900/60 p-4 rounded-xl flex gap-3 items-center text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <span className="font-semibold block text-sm">{t.bot.connectedHeader}</span>
            {t.bot.connectedDesc}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
          {t.bot.token}
        </label>
        <input
          type="password"
          placeholder={t.bot.tokenPlaceholder}
          value={config.discordToken}
          onChange={(e) => setConfig({ ...config, discordToken: e.target.value })}
          className="bg-black/45 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
        />
        <span className="text-[10px] text-white/30">
          {t.bot.tokenHelp}{" "}
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline"
          >
            {t.bot.devPortal}
          </a>
          .
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
          {t.bot.channel}
        </label>
        <input
          type="text"
          placeholder={t.bot.channelPlaceholder}
          value={config.channelId}
          onChange={(e) => setConfig({ ...config, channelId: e.target.value })}
          className="bg-black/45 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
        />
        <span className="text-[10px] text-white/30">{t.bot.channelHelp}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.bot.maxSize}
          </label>
          <div className="relative">
            <input
              type="number"
              placeholder="8"
              value={config.mediaMaxSizeMB}
              onChange={(e) => setConfig({ ...config, mediaMaxSizeMB: Number(e.target.value) })}
              className="bg-black/45 w-full border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
            />
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs font-mono text-white/30 select-none">
              MB
            </span>
          </div>
          <span className="text-[10px] text-white/30">{t.bot.maxSizeHelp}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.bot.duration}
          </label>
          <div className="relative">
            <input
              type="number"
              placeholder="8000"
              value={config.alertDuration}
              onChange={(e) => setConfig({ ...config, alertDuration: Number(e.target.value) })}
              disabled={config.syncDurationWithMedia}
              className="bg-black/45 w-full border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs font-mono text-white/30 select-none">
              ms
            </span>
          </div>
          <span className="text-[10px] text-white/30">{t.bot.durationHelp}</span>

          <label className="mt-2 flex items-center gap-2 cursor-pointer group">
            <div
              className={`w-5 h-5 rounded overflow-hidden border flex items-center justify-center transition-all ${config.syncDurationWithMedia ? "bg-indigo-600 border-indigo-500" : "bg-black/45 border-white/10 group-hover:border-white/30"}`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={config.syncDurationWithMedia || false}
                onChange={(e) => setConfig({ ...config, syncDurationWithMedia: e.target.checked })}
              />
              {config.syncDurationWithMedia && (
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white/80 select-none group-hover:text-white transition-colors">
                {t.bot.syncDuration}
              </span>
              <span className="text-[10px] text-white/40 block leading-tight">
                {t.bot.syncDurationHelp}
              </span>
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-1.5 col-span-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.bot.shortcut}
          </label>
          <input
            type="text"
            placeholder="Ex: Escape or Space or S"
            value={config.stopAlertShortcut || "Escape"}
            onChange={(e) => setConfig({ ...config, stopAlertShortcut: e.target.value })}
            className="bg-black/45 w-full border border-white/10 rounded-xl px-4 py-3 text-sm text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
          />
          <span className="text-[10px] text-white/30">{t.bot.shortcutHelp}</span>
        </div>

        <div className="flex flex-col gap-1.5 col-span-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.bot.alertSound}
          </label>
          <input
            type="url"
            placeholder="https://example.com/alert.mp3"
            value={config.alertSoundUrl || ""}
            onChange={(e) => setConfig({ ...config, alertSoundUrl: e.target.value })}
            className="bg-black/45 w-full border border-white/10 rounded-xl px-4 py-3 text-sm text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
          />
          <span className="text-[10px] text-white/30">{t.bot.alertSoundHelp}</span>
        </div>

        <div className="flex flex-col gap-1.5 col-span-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.bot.cookies}
          </label>
          <textarea
            placeholder="# Netscape HTTP Cookie File&#10;..."
            value={config.youtubeCookiesContent || ""}
            onChange={(e) => setConfig({ ...config, youtubeCookiesContent: e.target.value })}
            onBlur={(e) => {
              const raw = e.target.value;
              if (!raw) return;
              const relevantDomains = ["youtube.com", "instagram.com", "tiktok.com", "google.com"];
              const filtered = raw
                .split("\n")
                .filter((line) => {
                  const t = line.trim();
                  if (!t || t.startsWith("#")) return true;
                  return relevantDomains.some((d) => t.includes(d));
                })
                .join("\n");
              setConfig({ ...config, youtubeCookiesContent: filtered });
            }}
            className="bg-black/45 w-full border border-white/10 rounded-xl px-4 py-3 text-xs font-mono min-h-[140px] text-[#0f0] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all duration-300"
          />

          <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-3 mt-1">
            <span className="text-[10px] text-indigo-200/70">{t.bot.cookiesHelp}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
