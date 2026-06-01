import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import {
  Bot,
  Sliders,
  Shield,
  Copy,
  RefreshCw,
  Monitor,
  Send,
  HeartPulse,
  Tv,
  GripVertical,
  X,
  CheckCircle2,
  Loader2,
  ExternalLink,
  SkipForward,
  RotateCcw,
  ScrollText,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { UIConfig, LogEntry, AlertPayload, BotStatus, MediaType, ServerLogEntry } from "../types";
import { locales, Language } from "../locales";
import NowPlayingPreview from "./NowPlayingPreview";
import TutorialOverlay from "./TutorialOverlay";
import BotTab from "./tabs/BotTab";
import StylingTab from "./tabs/StylingTab";
import ModerationTab from "./tabs/ModerationTab";
import SimulatorTab from "./tabs/SimulatorTab";
import HealthTab from "./tabs/HealthTab";

export default function StreamerDashboard() {
  const [activeTab, setActiveTab] = useState<"credentials" | "styling" | "moderation" | "simulator" | "health">(
    "credentials"
  );
  const [saveLoading, setSaveLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("hasSeenTutorial"));
  const [pendingQueue, setPendingQueue] = useState<AlertPayload[]>([]);
  const [nowPlaying, setNowPlaying] = useState<AlertPayload | null>(null);
  const [config, setConfig] = useState<UIConfig>({
    discordToken: "",
    channelId: "",
    alertDuration: 8000,
    syncDurationWithMedia: true,
    mediaMaxSizeMB: 8,
    bannedWords: [],
    neonColor: "#6366f1",
    alertStyle: "neon",
    bannedWordsAction: "censor",
    stopAlertShortcut: "Escape",
    youtubeCookiesContent: "",
    cooldownSeconds: 0,
    blockLinks: false,
    blockNSFW: false,
    language: "fr",
  });
  const [botStatus, setBotStatus] = useState<BotStatus>({ status: "disconnected", botUser: "", errorMsg: "" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);
  const [logsView, setLogsView] = useState<"activity" | "system">("activity");
  const [expandedServerLogs, setExpandedServerLogs] = useState<Set<string>>(new Set());
  const [bannedWordInput, setBannedWordInput] = useState("");
  const [roleIdInput, setRoleIdInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [dockCopyFeedback, setDockCopyFeedback] = useState(false);
  const [statusCopyFeedback, setStatusCopyFeedback] = useState(false);
  const [simName, setSimName] = useState("Viewer_Lucky_Hype");
  const [simText, setSimText] = useState("Un clip sur le boss final ce soir ! GG");
  const [simType, setSimType] = useState<MediaType>("image");
  const [simMediaUrl, setSimMediaUrl] = useState(
    "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1280&auto=format&fit=crop"
  );

  const t = locales[(config.language as Language) ?? "fr"];

  const fetchSettingsAndLogs = async () => {
    try {
      const [setRes, logRes, botRes, srvLogRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/logs"),
        fetch("/api/bot-status"),
        fetch("/api/server-logs"),
      ]);
      if (setRes.ok) setConfig(await setRes.json());
      if (logRes.ok) setLogs(await logRes.json());
      if (botRes.ok) setBotStatus(await botRes.json());
      if (srvLogRes.ok) setServerLogs(await srvLogRes.json());
    } catch (err) {
      console.error("Dashboard failed pulling system metrics:", err);
    }
  };

  const fetchBotStatus = async () => {
    try {
      const botRes = await fetch("/api/bot-status");
      if (botRes.ok) setBotStatus(await botRes.json());
    } catch (err) {
      console.error("Dashboard failed pulling bot status:", err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettingsAndLogs(); // async initial fetch — setState called inside is intentional
    const interval = setInterval(fetchBotStatus, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Dedicated socket for server-authoritative queue tracking.
  // Separate from the embed's socket so embed's local playback state doesn't desync the display.
  useEffect(() => {
    const socket = io(window.location.origin, { reconnection: true });

    socket.on("connect", () => socket.emit("get_initial_state"));
    socket.on("initial_state", (q: AlertPayload[]) => setPendingQueue(q));
    socket.on("force_queue_update", (q: AlertPayload[]) => setPendingQueue(q));
    socket.on("new_alert", (alert: AlertPayload) =>
      setPendingQueue((prev) => (prev.some((i) => i.id === alert.id) ? prev : [...prev, alert]))
    );
    socket.on("remove_queue_item", (id: string) => setPendingQueue((prev) => prev.filter((i) => i.id !== id)));
    socket.on("clear_queue", () => setPendingQueue([]));
    socket.on("now_playing", (alert: AlertPayload | null) => setNowPlaying(alert));
    socket.on("new_log", (log: LogEntry) => {
      setLogs((prev) => {
        if (prev.some((l) => l.id === log.id)) return prev;
        return [log, ...prev].slice(0, 500);
      });
    });
    socket.on("initial_logs", (logs: LogEntry[]) => {
      setLogs((prev) => {
        const knownIds = new Set(prev.map((l) => l.id));
        const newEntries = logs.filter((l) => !knownIds.has(l.id));
        if (newEntries.length === 0) return prev;
        return [...newEntries, ...prev].slice(0, 500);
      });
    });
    socket.on("logs_cleared", () => setLogs([]));

    socket.on("new_server_log", (log: ServerLogEntry) => {
      setServerLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [log, ...prev].slice(0, 200)));
    });
    socket.on("initial_server_logs", (incoming: ServerLogEntry[]) => {
      setServerLogs((prev) => {
        const knownIds = new Set(prev.map((l) => l.id));
        const next = incoming.filter((l) => !knownIds.has(l.id));
        return next.length === 0 ? prev : [...next, ...prev].slice(0, 200);
      });
    });
    socket.on("server_logs_cleared", () => setServerLogs([]));

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      const configKey = config.stopAlertShortcut || "Escape";
      const matchesKey =
        e.key.toLowerCase() === configKey.toLowerCase() ||
        e.code.toLowerCase() === configKey.toLowerCase() ||
        (configKey.toLowerCase() === "space" && e.key === " ") ||
        (configKey.toLowerCase() === "escape" && e.key === "Escape");
      if (matchesKey) {
        e.preventDefault();
        try {
          await fetch("/api/skip-alert", { method: "POST" });
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [config.stopAlertShortcut]);

  const handleSaveSettings = async (overrideConfig: UIConfig = config) => {
    setSaveLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrideConfig),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error || `Failed to save: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) setConfig(data.settings);
    } catch (err) {
      console.error("Failed saving settings:", err);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleManualBotReconnect = async () => {
    try {
      setBotStatus((prev) => ({ ...prev, status: "connecting" }));
      const res = await fetch("/api/bot-reconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) fetchSettingsAndLogs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddBannedWord = () => {
    if (!bannedWordInput?.trim()) return;
    const cleanWord = bannedWordInput.trim().toLowerCase();
    if (config.bannedWords.includes(cleanWord)) {
      setBannedWordInput("");
      return;
    }
    const newConfig = { ...config, bannedWords: [...config.bannedWords, cleanWord] };
    setConfig(newConfig);
    setBannedWordInput("");
    handleSaveSettings(newConfig);
  };

  const handleRemoveBannedWord = (word: string) => {
    const newConfig = { ...config, bannedWords: config.bannedWords.filter((w) => w !== word) };
    setConfig(newConfig);
    handleSaveSettings(newConfig);
  };

  const handleAddRoleId = () => {
    const clean = roleIdInput.trim();
    if (!clean || !/^\d+$/.test(clean)) {
      setRoleIdInput("");
      return;
    }
    if ((config.allowedRoleIds || []).includes(clean)) {
      setRoleIdInput("");
      return;
    }
    const newConfig = { ...config, allowedRoleIds: [...(config.allowedRoleIds || []), clean] };
    setConfig(newConfig);
    setRoleIdInput("");
    handleSaveSettings(newConfig);
  };

  const handleRemoveRoleId = (id: string) => {
    const newConfig = { ...config, allowedRoleIds: (config.allowedRoleIds || []).filter((r) => r !== id) };
    setConfig(newConfig);
    handleSaveSettings(newConfig);
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/logs/clear", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearServerLogs = async () => {
    try {
      await fetch("/api/server-logs/clear", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  };

  const copyOverlayUrlToClipboard = () => {
    navigator.clipboard.writeText(`${window.location.origin}/overlay`);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  const copyDockUrlToClipboard = () => {
    navigator.clipboard.writeText(`${window.location.origin}/dock`);
    setDockCopyFeedback(true);
    setTimeout(() => setDockCopyFeedback(false), 2500);
  };

  const copyStatusUrlToClipboard = () => {
    navigator.clipboard.writeText(`${window.location.origin}/status`);
    setStatusCopyFeedback(true);
    setTimeout(() => setStatusCopyFeedback(false), 2500);
  };

  const handleTriggerTest = async (preset?: Partial<AlertPayload>) => {
    const payload = preset ?? {
      authorName: simName,
      text: simText,
      type: simType,
      mediaUrl: simMediaUrl,
    };
    await fetch("/api/trigger-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const tabs = [
    { id: "credentials" as const, icon: <Bot className="w-3.5 h-3.5" />, label: t.tabs.bot },
    { id: "styling" as const, icon: <Sliders className="w-3.5 h-3.5" />, label: t.tabs.styling },
    { id: "moderation" as const, icon: <Shield className="w-3.5 h-3.5" />, label: t.tabs.filter },
    { id: "simulator" as const, icon: <Send className="w-3.5 h-3.5" />, label: t.tabs.simulator },
    { id: "health" as const, icon: <HeartPulse className="w-3.5 h-3.5" />, label: t.tabs.health },
  ];

  const showSaveButton = activeTab === "credentials" || activeTab === "styling" || activeTab === "moderation";

  return (
    <div className="min-h-screen bg-[#050508] text-[#e0e0e6] flex flex-col font-sans selection:bg-indigo-600 selection:text-white relative overflow-x-hidden">
      {showTutorial && (
        <TutorialOverlay
          onComplete={() => {
            localStorage.setItem("hasSeenTutorial", "true");
            setShowTutorial(false);
          }}
          setActiveTab={setActiveTab}
        />
      )}

      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[70%] w-[600px] h-[600px] bg-indigo-600/5 blur-[120px] rounded-full" />
        <div className="absolute top-[60%] left-[5%] w-[500px] h-[500px] bg-purple-700/5 blur-[130px] rounded-full" />
      </div>

      {/* ── Header Nav ── */}
      <nav className="relative z-30 min-h-[60px] border-b border-white/[0.07] px-4 sm:px-8 flex flex-col sm:flex-row items-center sm:justify-between gap-3 py-3 sm:py-0 bg-[#07070c]/80 backdrop-blur-xl sticky top-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-[0_0_18px_rgba(99,102,241,0.55)] transition-transform hover:scale-110 duration-200">
            <Tv className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base sm:text-lg tracking-tight text-white">StreamAlerts</span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language */}
          <select
            value={config.language}
            onChange={(e) => {
              const newLang = e.target.value as Language;
              const updated = { ...config, language: newLang };
              setConfig(updated);
              fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updated),
              }).catch(() => {});
            }}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-indigo-500/60 cursor-pointer transition"
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
            <option value="uwu-fr">UwU FR</option>
            <option value="uwu-en">UwU EN</option>
          </select>

          {/* Bot status pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
              botStatus.status === "connected"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : botStatus.status === "connecting"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                botStatus.status === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : botStatus.status === "connecting"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-red-400"
              }`}
            />
            <span className="hidden sm:inline">
              {botStatus.status === "connected"
                ? botStatus.botUser || "Connecté"
                : botStatus.status === "connecting"
                  ? "Liaison..."
                  : "Déconnecté"}
            </span>
            {botStatus.status !== "connected" && botStatus.status !== "connecting" && (
              <button
                onClick={handleManualBotReconnect}
                title={t.bot.reconnect}
                className="ml-0.5 p-0.5 hover:bg-white/10 rounded transition"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Main Grid ── */}
      <main className="relative z-10 flex-1 p-3 sm:p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ── LEFT COLUMN ── */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          {/* Tab bar */}
          <div className="bg-white/[0.025] border border-white/[0.07] backdrop-blur-md rounded-2xl p-1.5 flex gap-1 items-center overflow-x-auto select-none scrollbar-none">
            {tabs.map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 shrink-0 cursor-pointer whitespace-nowrap ${
                  activeTab === id
                    ? "bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.45)] border-t border-white/20"
                    : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Tab panel */}
          <div className="bg-white/[0.025] border border-white/[0.07] rounded-3xl p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto">
            {activeTab === "credentials" && (
              <BotTab
                config={config}
                setConfig={setConfig}
                botStatus={botStatus}
                t={t}
                handleManualBotReconnect={handleManualBotReconnect}
                saveLoading={saveLoading}
                handleSaveSettings={handleSaveSettings}
              />
            )}
            {activeTab === "styling" && (
              <StylingTab
                config={config}
                setConfig={setConfig}
                t={t}
                saveLoading={saveLoading}
                handleSaveSettings={handleSaveSettings}
              />
            )}
            {activeTab === "moderation" && (
              <ModerationTab
                config={config}
                setConfig={setConfig}
                t={t}
                bannedWordInput={bannedWordInput}
                setBannedWordInput={setBannedWordInput}
                handleAddBannedWord={handleAddBannedWord}
                handleRemoveBannedWord={handleRemoveBannedWord}
                saveLoading={saveLoading}
                handleSaveSettings={handleSaveSettings}
                roleIdInput={roleIdInput}
                setRoleIdInput={setRoleIdInput}
                handleAddRoleId={handleAddRoleId}
                handleRemoveRoleId={handleRemoveRoleId}
              />
            )}
            {activeTab === "simulator" && (
              <SimulatorTab
                t={t}
                simName={simName}
                setSimName={setSimName}
                simType={simType}
                setSimType={setSimType}
                simText={simText}
                setSimText={setSimText}
                simMediaUrl={simMediaUrl}
                setSimMediaUrl={setSimMediaUrl}
                handleTriggerTest={handleTriggerTest}
              />
            )}
            {activeTab === "health" && <HealthTab botStatus={botStatus} t={t} />}
          </div>

          {/* Save button */}
          {showSaveButton && (
            <button
              onClick={() => handleSaveSettings()}
              disabled={saveLoading}
              className="group relative w-full overflow-hidden bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_28px_rgba(99,102,241,0.5)]"
            >
              {saveLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t.bot.saveWorking}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 opacity-80" /> {t.bot.save}
                </>
              )}
              <span className="absolute inset-0 bg-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl" />
            </button>
          )}
        </section>

        {/* ── RIGHT COLUMN ── */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* ── OBS Source Setup Card ── */}
          <div className="bg-white/[0.025] border border-indigo-500/25 rounded-3xl overflow-hidden shadow-[0_0_24px_rgba(99,102,241,0.07)]">
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2.5">
              <ExternalLink className="w-4 h-4 text-indigo-400/70" />
              <span className="text-sm font-semibold text-white/80">{t.display.urlTitle}</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-[11px] text-white/40 leading-relaxed">{t.display.urlDesc}</p>

              {/* ── Browser Source section ── */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t.display.overlaySection}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-white/30 w-14 shrink-0">{t.display.overlayLabel}</span>
                  <input
                    readOnly
                    value={`${window.location.origin}/overlay`}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-indigo-300 truncate focus:outline-none focus:border-indigo-500/50 cursor-text"
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={copyOverlayUrlToClipboard}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                      copyFeedback
                        ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                    }`}
                  >
                    {copyFeedback ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copyFeedback ? t.display.copied : t.display.copy}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {[t.display.step1, t.display.step2, t.display.step3].map((step, i) => (
                    <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-indigo-600/25 text-indigo-300 text-[8px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-[9px] text-white/25 leading-tight truncate">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Custom Docks section ── */}
              <div className="flex flex-col gap-1.5 pt-2.5 border-t border-white/[0.05]">
                <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t.display.dockSection}</span>
                {(
                  [
                    { label: t.display.dockLabel, path: "/dock", copy: copyDockUrlToClipboard, feedback: dockCopyFeedback },
                    { label: t.display.statusLabel, path: "/status", copy: copyStatusUrlToClipboard, feedback: statusCopyFeedback },
                  ] as const
                ).map(({ label, path, copy, feedback }) => (
                  <div key={path} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/30 w-14 shrink-0 truncate">{label}</span>
                    <input
                      readOnly
                      value={`${window.location.origin}${path}`}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-indigo-300 truncate focus:outline-none focus:border-indigo-500/50 cursor-text"
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={copy}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                        feedback
                          ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                      }`}
                    >
                      {feedback ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {feedback ? t.display.copied : t.display.copy}
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  {[t.display.dockStep1, t.display.dockStep2, t.display.dockStep3].map((step, i) => (
                    <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-purple-600/25 text-purple-300 text-[8px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-[9px] text-white/25 leading-tight truncate">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Preview panel */}
          <div className="bg-white/[0.025] border border-white/[0.07] rounded-3xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2.5">
              <Monitor className="w-4 h-4 text-indigo-400/70" />
              <span className="text-sm font-semibold text-white/80">Preview OBS</span>
            </div>
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              <NowPlayingPreview alert={nowPlaying} />
            </div>
          </div>

          {/* Queue (shown only when non-empty) */}
          {pendingQueue.length > 0 && (
            <div className="bg-white/[0.025] border border-white/[0.07] rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/80">File d&apos;attente</span>
                  <span className="bg-indigo-600/25 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {pendingQueue.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetch("/api/skip-alert", { method: "POST" })}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition font-medium flex items-center gap-1"
                  >
                    <SkipForward className="w-3 h-3" /> Skip
                  </button>
                  <button
                    onClick={() => fetch("/api/queue/clear", { method: "POST" })}
                    className="text-[11px] text-red-400/70 hover:text-red-400 transition font-medium"
                  >
                    Vider
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {pendingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="group bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.05] px-3 py-2 rounded-xl flex items-center gap-2 text-xs transition"
                  >
                    <GripVertical className="w-3 h-3 text-white/20 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-white/90 truncate block">{item.authorName}</span>
                      {item.text && <span className="text-white/35 text-[10px] truncate block">{item.text}</span>}
                    </div>
                    <button
                      onClick={() =>
                        fetch("/api/queue/remove-item", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: item.id }),
                        })
                      }
                      className="shrink-0 text-white/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="bg-white/[0.025] border border-white/[0.07] rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2 shrink-0">
              <ScrollText className="w-4 h-4 text-indigo-400/70 shrink-0" />
              {/* Tab toggle */}
              <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
                <button
                  onClick={() => setLogsView("activity")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    logsView === "activity"
                      ? "bg-indigo-600 text-white shadow-[0_0_8px_rgba(99,102,241,0.35)]"
                      : "text-white/30 hover:text-white/60"
                  }`}
                >
                  {t.logs.title}
                  {logs.length > 0 && (
                    <span className={`text-[9px] font-mono ${logsView === "activity" ? "text-white/70" : "text-white/25"}`}>
                      {logs.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setLogsView("system")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    logsView === "system"
                      ? "bg-amber-600/80 text-white shadow-[0_0_8px_rgba(217,119,6,0.35)]"
                      : "text-white/30 hover:text-white/60"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Système
                  {serverLogs.length > 0 && (
                    <span className={`text-[9px] font-mono ${logsView === "system" ? "text-white/70" : "text-amber-400/60"}`}>
                      {serverLogs.length}
                    </span>
                  )}
                </button>
              </div>

              <button
                onClick={logsView === "activity" ? handleClearLogs : handleClearServerLogs}
                className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-red-400/50 hover:text-red-300 hover:bg-red-950/25 px-2.5 py-1 rounded-lg border border-transparent hover:border-red-900/30 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                {t.logs.clear}
              </button>
            </div>

            {/* Activity log rows */}
            {logsView === "activity" && (
              <div className="flex-1 overflow-y-auto min-h-[100px] max-h-64">
                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                    <ScrollText className="w-5 h-5 text-white/10" />
                    <span className="text-[11px] text-white/15">{t.logs.empty}</span>
                  </div>
                )}
                {logs.map((log, i) => (
                  <div
                    key={log.id ?? i}
                    className={`group flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] border-l-2 hover:bg-white/[0.02] transition-colors ${
                      log.status === "approved"
                        ? "border-l-emerald-500/50"
                        : log.status === "blocked"
                          ? "border-l-red-500/50"
                          : log.status === "censored"
                            ? "border-l-amber-500/50"
                            : "border-l-white/[0.08]"
                    }`}
                  >
                    <span className="text-white/20 shrink-0 tabular-nums font-mono text-[9px] w-9 leading-tight">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span
                      className={`shrink-0 text-[8px] font-bold font-mono px-1 py-0.5 rounded uppercase tracking-wide ${
                        log.type === "video"
                          ? "bg-purple-900/30 text-purple-300/70"
                          : log.type === "image"
                            ? "bg-sky-900/30 text-sky-300/70"
                            : log.type === "iframe"
                              ? "bg-teal-900/30 text-teal-300/70"
                              : "bg-orange-900/30 text-orange-300/70"
                      }`}
                    >
                      {log.type === "video" ? "vid" : log.type === "image" ? "img" : log.type === "iframe" ? "web" : "url"}
                    </span>
                    {log.author && (
                      <span className="text-indigo-400/70 shrink-0 font-semibold truncate max-w-[72px] text-[10px] leading-tight">
                        {log.author}
                      </span>
                    )}
                    <span
                      className={`truncate flex-1 text-[10px] leading-tight ${
                        log.status === "approved"
                          ? "text-white/50"
                          : log.status === "blocked"
                            ? "text-red-300/60"
                            : log.status === "censored"
                              ? "text-amber-300/60"
                              : "text-white/35"
                      }`}
                    >
                      {log.reason}
                    </span>
                    {log.mediaUrl && (
                      <button
                        onClick={() =>
                          fetch("/api/replay-alert", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ logId: log.id }),
                          }).catch(() => {})
                        }
                        title={t.logs.replay}
                        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-indigo-600/15 border border-indigo-600/20 text-indigo-400/70 hover:bg-indigo-600/35 hover:border-indigo-500/50 hover:text-indigo-200 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* System log rows */}
            {logsView === "system" && (
              <div className="flex-1 overflow-y-auto min-h-[100px] max-h-64">
                {serverLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                    <AlertTriangle className="w-5 h-5 text-white/10" />
                    <span className="text-[11px] text-white/15">Aucune erreur serveur</span>
                  </div>
                )}
                {serverLogs.map((log) => {
                  const hasData = log.data && Object.keys(log.data).length > 0;
                  const isExpanded = expandedServerLogs.has(log.id);
                  const toggleExpand = () =>
                    setExpandedServerLogs((prev) => {
                      const next = new Set(prev);
                      next.has(log.id) ? next.delete(log.id) : next.add(log.id);
                      return next;
                    });

                  return (
                    <div
                      key={log.id}
                      className={`border-b border-white/[0.04] border-l-2 transition-colors ${
                        log.level === "fatal"
                          ? "border-l-red-600/80"
                          : log.level === "error"
                            ? "border-l-red-500/50"
                            : "border-l-amber-500/50"
                      }`}
                    >
                      {/* Summary row */}
                      <div
                        className={`flex items-start gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors ${hasData ? "cursor-pointer" : ""}`}
                        onClick={hasData ? toggleExpand : undefined}
                      >
                        <span className="text-white/20 shrink-0 tabular-nums font-mono text-[9px] w-9 leading-tight mt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span
                          className={`shrink-0 text-[8px] font-bold font-mono px-1 py-0.5 rounded uppercase tracking-wide mt-0.5 ${
                            log.level === "fatal"
                              ? "bg-red-900/50 text-red-300"
                              : log.level === "error"
                                ? "bg-red-900/30 text-red-400/80"
                                : "bg-amber-900/30 text-amber-300/80"
                          }`}
                        >
                          {log.level === "fatal" ? "fatal" : log.level === "error" ? "err" : "warn"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`block text-[10px] leading-tight ${isExpanded ? "" : "truncate"} ${
                              log.level === "fatal"
                                ? "text-red-300/80"
                                : log.level === "error"
                                  ? "text-red-300/60"
                                  : "text-amber-200/60"
                            }`}
                          >
                            {log.msg}
                          </span>
                          {!isExpanded && hasData && (
                            <span className="block text-[9px] font-mono text-white/20 truncate mt-0.5">
                              {Object.entries(log.data!)
                                .slice(0, 3)
                                .map(([k, v]) => {
                                  if (Array.isArray(v)) return `${k}: [${v.length}]`;
                                  if (v !== null && typeof v === "object") {
                                    const s = JSON.stringify(v);
                                    return `${k}: ${s.length > 40 ? s.slice(0, 40) + "…" : s}`;
                                  }
                                  const s = String(v);
                                  return `${k}: ${s.length > 60 ? s.slice(0, 60) + "…" : s}`;
                                })
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                        {hasData && (
                          <span className="shrink-0 text-white/20 mt-0.5">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </span>
                        )}
                      </div>

                      {/* Expanded data panel */}
                      {isExpanded && hasData && (
                        <div className="mx-3 mb-2 rounded-lg bg-black/30 border border-white/[0.06] overflow-auto max-h-48">
                          <pre className="p-2.5 text-[9px] font-mono text-white/40 leading-relaxed whitespace-pre-wrap break-all">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
