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
} from "lucide-react";
import { UIConfig, LogEntry, AlertPayload, BotStatus, MediaType } from "../types";
import { locales, Language } from "../locales";
import NowPlayingPreview from "./NowPlayingPreview";
import TutorialOverlay from "./TutorialOverlay";
import BotTab from "./tabs/BotTab";
import StylingTab from "./tabs/StylingTab";
import ModerationTab from "./tabs/ModerationTab";
import SimulatorTab from "./tabs/SimulatorTab";
import HealthTab from "./tabs/HealthTab";

export default function StreamerDashboard() {
  const [activeTab, setActiveTab] = useState<
    "credentials" | "styling" | "moderation" | "simulator" | "health"
  >("credentials");
  const [saveLoading, setSaveLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
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
  const [bannedWordInput, setBannedWordInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [simName, setSimName] = useState("Viewer_Lucky_Hype");
  const [simText, setSimText] = useState("Un clip sur le boss final ce soir ! GG");
  const [simType, setSimType] = useState<MediaType>("image");
  const [simMediaUrl, setSimMediaUrl] = useState(
    "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1280&auto=format&fit=crop"
  );

  const t = locales[config.language as Language || "fr"];

  const fetchSettingsAndLogs = async () => {
    try {
      const [setRes, logRes, botRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/logs"),
        fetch("/api/bot-status"),
      ]);
      if (setRes.ok) setConfig(await setRes.json());
      if (logRes.ok) setLogs(await logRes.json());
      if (botRes.ok) setBotStatus(await botRes.json());
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
    const hasSeen = localStorage.getItem("hasSeenTutorial");
    if (!hasSeen) setShowTutorial(true);
    fetchSettingsAndLogs();
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
      setPendingQueue((prev) => prev.some((i) => i.id === alert.id) ? prev : [...prev, alert])
    );
    socket.on("remove_queue_item", (id: string) =>
      setPendingQueue((prev) => prev.filter((i) => i.id !== id))
    );
    socket.on("clear_queue", () => setPendingQueue([]));
    socket.on("now_playing", (alert: AlertPayload | null) => setNowPlaying(alert));
    socket.on("new_log", (log: LogEntry) => {
      setLogs((prev) => {
        if (prev.some((l) => l.id === log.id)) return prev;
        return [log, ...prev].slice(0, 500);
      });
    });
    socket.on("logs_cleared", () => setLogs([]));

    return () => { socket.disconnect(); };
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
        try { await fetch("/api/skip-alert", { method: "POST" }); } catch (err) { console.error(err); }
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
      if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
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
    if (config.bannedWords.includes(cleanWord)) { setBannedWordInput(""); return; }
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

  const handleClearLogs = async () => {
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      setLogs([]);
    } catch (err) {
      console.error(err);
    }
  };

  const copyOverlayUrlToClipboard = () => {
    navigator.clipboard.writeText(`${window.location.origin}/overlay`);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
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
          onComplete={() => { localStorage.setItem("hasSeenTutorial", "true"); setShowTutorial(false); }}
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
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
            botStatus.status === "connected"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : botStatus.status === "connecting"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              botStatus.status === "connected"
                ? "bg-emerald-400 animate-pulse"
                : botStatus.status === "connecting"
                ? "bg-amber-400 animate-pulse"
                : "bg-red-400"
            }`} />
            <span className="hidden sm:inline">
              {botStatus.status === "connected"
                ? (botStatus.botUser || "Connecté")
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
              {saveLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.bot.saveWorking}</>
                : <><CheckCircle2 className="w-4 h-4 opacity-80" /> {t.bot.save}</>
              }
              <span className="absolute inset-0 bg-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl" />
            </button>
          )}
        </section>

        {/* ── RIGHT COLUMN ── */}
        <section className="lg:col-span-5 flex flex-col gap-4">

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
                <button
                  onClick={() => fetch("/api/queue/clear", { method: "POST" })}
                  className="text-[11px] text-red-400/70 hover:text-red-400 transition font-medium"
                >
                  Vider
                </button>
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
                      {item.text && (
                        <span className="text-white/35 text-[10px] truncate block">{item.text}</span>
                      )}
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

          {/* Copy OBS URL */}
          <button
            onClick={copyOverlayUrlToClipboard}
            className={`relative group flex items-center justify-center gap-2.5 border rounded-2xl py-3.5 px-4 text-sm font-semibold transition-all duration-300 overflow-hidden ${
              copyFeedback
                ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                : "bg-indigo-600/10 hover:bg-indigo-600/20 border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300"
            }`}
          >
            {copyFeedback ? (
              <><CheckCircle2 className="w-4 h-4" /> URL copiée !</>
            ) : (
              <><Copy className="w-4 h-4" /> Copier l&apos;URL OBS</>
            )}
          </button>

          {/* Logs */}
          <div className="bg-white/[0.025] border border-white/[0.07] rounded-3xl p-4 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-sm font-semibold text-white/80">Logs</span>
              <button
                onClick={handleClearLogs}
                className="text-[11px] text-red-400/70 hover:text-red-400 transition font-medium"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-px min-h-[120px] max-h-56">
              {logs.length === 0 && (
                <div className="flex items-center justify-center h-full text-white/20 text-xs">
                  Aucun log récent
                </div>
              )}
              {logs.map((log, i) => (
                <div
                  key={log.id ?? i}
                  className="text-[10px] font-mono text-white/45 border-b border-white/[0.04] pb-px pt-px flex gap-2 leading-relaxed"
                >
                  <span className="text-white/20 shrink-0 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {log.author && (
                    <span className="text-indigo-400/60 shrink-0 truncate max-w-[80px]">{log.author}</span>
                  )}
                  <span className="truncate">{log.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
