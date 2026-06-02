import { useState, useRef, useMemo } from "react";
import { TabProps } from "./types";
import {
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Key,
  Hash,
  Timer,
  HardDrive,
  Music2,
  FileText,
  Eye,
  EyeOff,
  Loader2,
  Play,
  ChevronDown,
} from "lucide-react";

const PLATFORM_DOMAINS: Record<string, string> = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "x.com": "X/Twitter",
  "twitter.com": "X/Twitter",
  "instagram.com": "Instagram",
  "tiktok.com": "TikTok",
  "twitch.tv": "Twitch",
  "reddit.com": "Reddit",
  "facebook.com": "Facebook",
};

export default function BotTab(props: TabProps) {
  const {
    config,
    setConfig,
    botStatus,
    t,
    handleManualBotReconnect: _handleManualBotReconnect,
    saveLoading: _saveLoading,
    handleSaveSettings: _handleSaveSettings,
  } = props;

  const [showToken, setShowToken] = useState(false);
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  const [soundPreviewPlaying, setSoundPreviewPlaying] = useState(false);
  const [cobaltOpen, setCobaltOpen] = useState(false);
  const soundPreviewRef = useRef<HTMLAudioElement | null>(null);

  const cookieDomainStatus = useMemo(() => {
    if (!config?.youtubeCookiesContent) return [];
    // eslint-disable-next-line react-hooks/purity
    const now = Math.floor(Date.now() / 1000);
    const platformStatus: Record<string, "ok" | "expired" | "session"> = {};
    for (const line of config.youtubeCookiesContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 6) continue;
      const domain = parts[0].replace(/^\./, "");
      const expiry = parseInt(parts[4], 10);
      const platform = Object.entries(PLATFORM_DOMAINS).find(([d]) => domain.endsWith(d))?.[1];
      if (!platform) continue;
      if (platformStatus[platform] === "ok") continue;
      if (expiry === 0) {
        platformStatus[platform] ??= "session";
      } else if (expiry < now) {
        platformStatus[platform] = "expired";
      } else {
        platformStatus[platform] = "ok";
      }
    }
    return Object.entries(platformStatus) as [string, "ok" | "expired" | "session"][];
  }, [config]);

  if (config === undefined || setConfig === undefined || botStatus === undefined || t === undefined) return null;

  const inputBase =
    "bg-[#08080f] w-full border border-white/[0.07] rounded-lg px-4 py-2.5 text-sm font-mono placeholder:text-white/15 focus:outline-none transition-all";

  const handleShortcutCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!capturingShortcut) return;
    e.preventDefault();
    const key = e.key === " " ? "Space" : e.key;
    setConfig({ ...config, stopAlertShortcut: key });
    setCapturingShortcut(false);
  };

  const handleSoundPreview = () => {
    if (!config.alertSoundUrl) return;
    if (soundPreviewPlaying && soundPreviewRef.current) {
      soundPreviewRef.current.pause();
      soundPreviewRef.current.currentTime = 0;
      setSoundPreviewPlaying(false);
      return;
    }
    const audio = new Audio(config.alertSoundUrl);
    soundPreviewRef.current = audio;
    audio
      .play()
      .then(() => {
        setSoundPreviewPlaying(true);
        audio.onended = () => setSoundPreviewPlaying(false);
      })
      .catch(() => setSoundPreviewPlaying(false));
  };

  const cookieLineCount = config.youtubeCookiesContent
    ? config.youtubeCookiesContent.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length
    : 0;

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
          <Terminal className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold font-mono text-white tracking-wider uppercase">{t.bot.title}</h2>
          <p className="text-[10px] text-white/30 mt-0.5 font-mono">{t.bot.desc}</p>
        </div>
      </div>

      {/* Status Banner */}
      {botStatus.status === "error" && (
        <div className="relative overflow-hidden rounded-xl border border-rose-500/25 bg-rose-950/15 p-4">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-500 rounded-r-full" />
          <div className="flex gap-3 items-start pl-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold font-mono text-rose-300 uppercase tracking-wider block">
                {t.bot.error}
              </span>
              <span className="text-[11px] font-mono text-rose-400/60 mt-1 block break-all">{botStatus.errorMsg}</span>
            </div>
          </div>
        </div>
      )}

      {botStatus.status === "connecting" && (
        <div className="relative overflow-hidden rounded-xl border border-amber-500/25 bg-amber-950/10 p-4">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400 rounded-r-full animate-pulse" />
          <div className="flex gap-3 items-center pl-2">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span className="text-xs font-bold font-mono text-amber-300 uppercase tracking-wider">
              {t.bot.connecting}
            </span>
          </div>
        </div>
      )}

      {botStatus.status === "connected" && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 rounded-r-full" />
          <div className="flex gap-3 items-center pl-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-xs font-bold font-mono text-emerald-300 uppercase tracking-wider block">
                {t.bot.connectedHeader}
              </span>
              <span className="text-[11px] font-mono text-emerald-400/50">{t.bot.connectedDesc}</span>
            </div>
          </div>
        </div>
      )}

      {/* Token */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Key className="w-3 h-3 text-violet-400/60" />
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.token}</label>
        </div>
        <div className="relative flex items-center">
          <input
            type={showToken ? "text" : "password"}
            placeholder={t.bot.tokenPlaceholder}
            value={config.discordToken}
            onChange={(e) => setConfig({ ...config, discordToken: e.target.value })}
            className={`${inputBase} text-violet-200 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/15 pr-10`}
          />
          <button
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-3 text-white/25 hover:text-white/60 transition-colors"
            title={showToken ? "Hide token" : "Show token"}
          >
            {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <span className="text-[10px] text-white/20 font-mono">
          {t.bot.tokenHelp}{" "}
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noreferrer"
            className="text-violet-400/60 hover:text-violet-400 transition-colors"
          >
            {t.bot.devPortal}
          </a>
        </span>
      </div>

      {/* Channel */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Hash className="w-3 h-3 text-cyan-400/60" />
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.channel}</label>
        </div>
        <input
          type="text"
          placeholder={t.bot.channelPlaceholder}
          value={config.channelId}
          onChange={(e) => setConfig({ ...config, channelId: e.target.value })}
          className={`${inputBase} text-cyan-200 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/15`}
        />
        <span className="text-[10px] text-white/20 font-mono">{t.bot.channelHelp}</span>
      </div>

      {/* Grid params */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3 h-3 text-white/30" />
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.maxSize}</label>
          </div>
          <div className="relative">
            <input
              type="number"
              placeholder="50"
              value={config.mediaMaxSizeMB}
              onChange={(e) => setConfig({ ...config, mediaMaxSizeMB: Number(e.target.value) })}
              className={`${inputBase} text-white/75 pr-10 focus:border-white/20`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/20 select-none">
              MB
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono leading-snug">{t.bot.maxSizeHelp}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-white/30" />
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.duration}</label>
          </div>
          <div className="relative">
            <input
              type="number"
              placeholder="8000"
              value={config.alertDuration}
              onChange={(e) => setConfig({ ...config, alertDuration: Number(e.target.value) })}
              disabled={config.syncDurationWithMedia}
              className={`${inputBase} text-white/75 pr-14 focus:border-white/20 disabled:opacity-35 disabled:cursor-not-allowed`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/20 select-none pointer-events-none">
              {!config.syncDurationWithMedia ? `${(config.alertDuration / 1000).toFixed(1)}s` : "ms"}
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer group mt-0.5">
            <div
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                config.syncDurationWithMedia
                  ? "bg-violet-600 border-violet-500"
                  : "bg-transparent border-white/20 group-hover:border-white/40"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={config.syncDurationWithMedia || false}
                onChange={(e) => setConfig({ ...config, syncDurationWithMedia: e.target.checked })}
              />
              {config.syncDurationWithMedia && (
                <svg
                  className="w-2 h-2 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={4}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-[10px] font-mono text-white/40 group-hover:text-white/70 transition-colors leading-snug">
              {t.bot.syncDuration}
            </span>
          </label>
        </div>
      </div>

      {/* Quality */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.mediaQuality}</label>
        <div className="flex gap-1 bg-black/30 border border-white/[0.07] rounded-xl p-1">
          {(["720", "1080", "1440", "2160"] as const).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setConfig({ ...config, mediaQuality: q })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                (config.mediaQuality ?? "1080") === q
                  ? "bg-indigo-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]"
                  : "text-white/35 hover:text-white/70 hover:bg-white/4"
              }`}
            >
              {q === "2160" ? "4K" : `${q}p`}
            </button>
          ))}
        </div>
      </div>

      {/* Shortcut */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.shortcut}</label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            placeholder="Escape"
            value={capturingShortcut ? "Press a key…" : config.stopAlertShortcut || "Escape"}
            onKeyDown={handleShortcutCapture}
            onBlur={() => setCapturingShortcut(false)}
            onClick={() => setCapturingShortcut(true)}
            className={`${inputBase} text-amber-200 focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10 cursor-pointer ${capturingShortcut ? "border-amber-500/50 bg-amber-950/10 animate-pulse" : ""}`}
          />
          {capturingShortcut && (
            <button
              onClick={() => setCapturingShortcut(false)}
              className="shrink-0 px-3 rounded-lg text-xs font-mono text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all"
            >
              ✕
            </button>
          )}
        </div>
        <span className="text-[10px] text-white/20 font-mono">
          {capturingShortcut ? t.bot.shortcutCapturing : t.bot.shortcutHelp}
        </span>
      </div>

      {/* Alert Sound */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Music2 className="w-3 h-3 text-white/30" />
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.alertSound}</label>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://example.com/alert.mp3"
            value={config.alertSoundUrl || ""}
            onChange={(e) => setConfig({ ...config, alertSoundUrl: e.target.value })}
            className={`${inputBase} text-white/70 focus:border-white/20`}
          />
          {config.alertSoundUrl && (
            <button
              onClick={handleSoundPreview}
              className={`shrink-0 flex items-center gap-1.5 px-3 rounded-lg text-xs font-mono font-bold border transition-all ${
                soundPreviewPlaying
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-white/[0.05] border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
              }`}
              title={soundPreviewPlaying ? "Stop preview" : "Preview sound"}
            >
              <Play className={`w-3 h-3 ${soundPreviewPlaying ? "fill-emerald-400" : ""}`} />
            </button>
          )}
        </div>
        <span className="text-[10px] text-white/20 font-mono">{t.bot.alertSoundHelp}</span>
      </div>

      {/* Cookies — terminal window */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-white/30" />
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.bot.cookies}</label>
          </div>
          {cookieLineCount > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span className="text-[10px] font-mono text-emerald-400/60 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded-md">
                {cookieLineCount} cookie{cookieLineCount !== 1 ? "s" : ""} {t.bot.cookiesLoaded}
              </span>
              {cookieDomainStatus.map(([platform, status]) => (
                <span
                  key={platform}
                  title={
                    status === "expired"
                      ? "Cookies expired — re-export from browser"
                      : status === "session"
                        ? "Session cookie — may expire on browser close"
                        : "Valid"
                  }
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                    status === "ok"
                      ? "text-emerald-400/70 bg-emerald-950/20 border-emerald-900/30"
                      : status === "expired"
                        ? "text-rose-400/70 bg-rose-950/20 border-rose-900/30"
                        : "text-amber-400/60 bg-amber-950/20 border-amber-900/30"
                  }`}
                >
                  {platform} {status === "ok" ? "✓" : status === "expired" ? "✗" : "~"}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.03] border-b border-white/[0.06]">
            <div className="w-2 h-2 rounded-full bg-rose-500/50" />
            <div className="w-2 h-2 rounded-full bg-amber-500/50" />
            <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
            <span className="text-[10px] font-mono text-white/20 ml-1.5">cookies.txt</span>
          </div>
          <textarea
            placeholder={"# Netscape HTTP Cookie File\n..."}
            value={config.youtubeCookiesContent || ""}
            onChange={(e) => setConfig({ ...config, youtubeCookiesContent: e.target.value })}
            onBlur={(e) => {
              const raw = e.target.value;
              if (!raw) return;
              const relevantDomains = [
                "youtube.com",
                "youtu.be",
                "google.com",
                "googleapis.com",
                "instagram.com",
                "tiktok.com",
                "x.com",
                "twitter.com",
                "t.co",
                "twitch.tv",
                "clips.twitch.tv",
                "reddit.com",
                "redd.it",
                "facebook.com",
                "fb.com",
                "vimeo.com",
                "dailymotion.com",
                "streamable.com",
                "kick.com",
                "bilibili.com",
                "nicovideo.jp",
                "soundcloud.com",
                "bandcamp.com",
                "rumble.com",
                "odysee.com",
                "pinterest.com",
                "tumblr.com",
              ];
              const filtered = raw
                .split("\n")
                .filter((line) => {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed.startsWith("#")) return true;
                  return relevantDomains.some((d) => trimmed.includes(d));
                })
                .join("\n");
              setConfig({ ...config, youtubeCookiesContent: filtered });
            }}
            className="bg-[#04060b] w-full px-4 py-3 text-xs font-mono min-h-[120px] text-emerald-400/70 placeholder:text-white/12 focus:outline-none resize-none"
          />
        </div>
        <div className="bg-violet-950/15 border border-violet-500/10 rounded-lg p-2.5">
          <span className="text-[10px] text-violet-200/40 font-mono leading-relaxed">{t.bot.cookiesHelp}</span>
        </div>
      </div>

      {/* Cobalt */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setCobaltOpen((v) => !v)}
          className="flex items-center justify-between w-full group"
        >
          <span className="text-[10px] font-mono text-white/35 uppercase tracking-widest group-hover:text-white/55 transition-colors">
            {t.bot.cobaltTitle}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-white/25 transition-transform duration-200 ${cobaltOpen ? "rotate-180" : ""}`}
          />
        </button>
        {cobaltOpen && (
          <div className="flex flex-col gap-2">
            <input
              type="url"
              className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              placeholder="http://localhost:9000/"
              value={config.cobaltApiUrl || ""}
              onChange={(e) => setConfig({ ...config, cobaltApiUrl: e.target.value })}
            />
            <input
              type="password"
              className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              placeholder={t.bot.cobaltKeyPlaceholder}
              value={config.cobaltApiKey || ""}
              onChange={(e) => setConfig({ ...config, cobaltApiKey: e.target.value })}
            />
            <div className="bg-violet-950/15 border border-violet-500/10 rounded-lg p-2.5">
              <span className="text-[10px] text-violet-200/40 font-mono leading-relaxed">{t.bot.cobaltHelp}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
