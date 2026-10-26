import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, Eye, HeartPulse, Palette, Plug, RefreshCw, Shield, Tv } from "lucide-react";
import { useQueueStore } from "../store/queueStore";
import { Button, SidebarNav, StatusPill, cx, inputClass, type NavItem, type Tone } from "../ui";
import SetupChecklist from "../components/SetupChecklist";
import LiveSection from "../sections/LiveSection";
import ModerationSection from "../sections/ModerationSection";
import LookSection from "../sections/LookSection";
import PosesSection from "../sections/PosesSection";
import ConnectionsSection from "../sections/ConnectionsSection";
import SystemSection from "../sections/SystemSection";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import { SECTION_PATH, useSection, type SectionId } from "./sections";
import { useTheme, type ThemePreference } from "./useTheme";
import type { Language } from "../locales";

const SECTION_VIEWS: Record<SectionId, () => React.JSX.Element> = {
  live: LiveSection,
  moderation: ModerationSection,
  look: LookSection,
  poses: PosesSection,
  connections: ConnectionsSection,
  system: SystemSection,
};

/** The media engine (bundled yt-dlp) announces over the socket when its first-run warm-up is over. */
function useMediaEngineReady(): boolean {
  const { socket } = useQueueStore();
  // Defaults to ready so already-warm sessions never flash "preparing"
  const [ready, setReady] = useState(true);
  useEffect(() => {
    if (!socket) return;
    const onStatus = ({ ready }: { ready: boolean }) => setReady(ready);
    const onReady = () => setReady(true);
    socket.on("media_engine_status", onStatus);
    socket.on("media_engine_ready", onReady);
    return () => {
      socket.off("media_engine_status", onStatus);
      socket.off("media_engine_ready", onReady);
    };
  }, [socket]);
  return ready;
}

/** Always-visible health of the four things a stream depends on. */
function StatusStrip() {
  const { t, botStatus, setup, goTo, reconnectBot } = useDashboard();
  const engineReady = useMediaEngineReady();

  const bot: { tone: Tone; text: string } =
    botStatus.status === "connected"
      ? { tone: "ok", text: botStatus.botUser || t.status.connected }
      : botStatus.status === "connecting"
        ? { tone: "warn", text: t.status.connecting }
        : { tone: "danger", text: t.status.disconnected };

  const items: Array<{ key: string; label: string; tone: Tone; text: string; target: SectionId; pulse?: boolean }> = [
    { key: "bot", label: t.status.bot, ...bot, target: "connections", pulse: botStatus.status !== "disconnected" },
    {
      key: "obs",
      label: t.status.obs,
      tone: !setup ? "neutral" : setup.obs ? "ok" : "danger",
      text: !setup ? "…" : setup.obs ? t.status.ok : t.status.off,
      target: "connections",
    },
    {
      key: "overlay",
      label: t.status.overlay,
      tone: !setup ? "neutral" : setup.overlay ? "ok" : "warn",
      text: !setup ? "…" : setup.overlay ? t.status.ok : t.status.waiting,
      target: "live",
    },
    {
      key: "engine",
      label: t.status.engine,
      tone: engineReady ? "ok" : "warn",
      text: engineReady ? t.status.ready : t.status.preparing,
      target: "system",
    },
  ];

  return (
    <ul aria-label={t.status.label} className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1">
          <button type="button" onClick={() => goTo(item.target)} className="rounded-full focus-ring cursor-pointer">
            <StatusPill tone={item.tone} pulse={item.pulse}>
              <span className="opacity-70">{item.label}</span>
              <span>{item.text}</span>
            </StatusPill>
          </button>
          {item.key === "bot" && botStatus.status === "disconnected" && (
            <button
              type="button"
              onClick={() => void reconnectBot()}
              aria-label={t.bot.reconnect}
              title={t.bot.reconnect}
              className="rounded-full p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg focus-ring cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ShellControls({ theme, setTheme }: { theme: ThemePreference; setTheme: (p: ThemePreference) => void }) {
  const { t, config, setConfig, saveState } = useDashboard();
  return (
    <div className="flex items-center gap-2">
      <span role="status" aria-live="polite" className="hidden text-xs text-fg-subtle sm:inline">
        {saveState === "saving" ? t.save.saving : saveState === "saved" ? t.save.saved : ""}
      </span>
      <label className="sr-only" htmlFor="theme-select">
        {t.shell.theme}
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
        className={cx(inputClass, "w-auto py-1.5 text-xs cursor-pointer")}
      >
        <option value="system">{t.shell.themeSystem}</option>
        <option value="light">{t.shell.themeLight}</option>
        <option value="dark">{t.shell.themeDark}</option>
      </select>
      <label className="sr-only" htmlFor="language-select">
        {t.shell.language}
      </label>
      <select
        id="language-select"
        value={config.language}
        onChange={(e) => setConfig((c) => ({ ...c, language: e.target.value as Language }))}
        className={cx(inputClass, "w-auto py-1.5 text-xs uppercase cursor-pointer")}
      >
        <option value="fr">FR</option>
        <option value="en">EN</option>
        <option value="uwu-fr">UwU FR</option>
        <option value="uwu-en">UwU EN</option>
      </select>
    </div>
  );
}

function Shell({ section, navigate }: { section: SectionId; navigate: (id: SectionId) => void }) {
  const { t } = useDashboard();
  const [theme, setTheme] = useTheme();
  const [showSetup, setShowSetup] = useState(() => !localStorage.getItem("hasSeenTutorial"));

  const items = useMemo<NavItem[]>(
    () =>
      [
        { id: "live", label: t.nav.live, icon: <Activity className="h-4 w-4" /> },
        { id: "moderation", label: t.nav.moderation, icon: <Shield className="h-4 w-4" /> },
        { id: "look", label: t.nav.look, icon: <Palette className="h-4 w-4" /> },
        { id: "poses", label: t.nav.poses, icon: <Eye className="h-4 w-4" /> },
        { id: "connections", label: t.nav.connections, icon: <Plug className="h-4 w-4" /> },
        { id: "system", label: t.nav.system, icon: <HeartPulse className="h-4 w-4" /> },
      ].map((item) => ({ ...item, href: SECTION_PATH[item.id as SectionId] })),
    [t]
  );

  const View = SECTION_VIEWS[section];

  return (
    <div className="min-h-screen bg-canvas font-sans text-fg selection:bg-accent selection:text-on-accent">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-70 focus:rounded-control focus:bg-panel focus:px-3 focus:py-2 focus-ring"
      >
        {t.shell.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-400 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-gutter py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-on-accent shadow-glow">
              <Tv className="h-4 w-4" aria-hidden />
            </div>
            <span className="text-lg font-bold tracking-tight">LiveChat</span>
          </div>
          <StatusStrip />
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="py-1.5 text-xs" onClick={() => setShowSetup(true)}>
              <Bot className="h-3.5 w-3.5" aria-hidden />
              {t.setup.reopen}
            </Button>
            <ShellControls theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-400 flex-col gap-4 px-gutter py-4 lg:flex-row lg:gap-6">
        <aside className="lg:sticky lg:top-20 lg:w-sidebar lg:shrink-0 lg:self-start">
          <SidebarNav
            label={t.nav.label}
            items={items}
            activeId={section}
            onNavigate={(item) => navigate(item.id as SectionId)}
            className="overflow-x-auto rounded-card border border-line bg-surface p-1.5"
          />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <View />
        </main>
      </div>

      {showSetup && (
        <SetupChecklist
          t={t}
          onClose={() => {
            localStorage.setItem("hasSeenTutorial", "true");
            setShowSetup(false);
          }}
          onGoToConnections={() => navigate("connections")}
        />
      )}
    </div>
  );
}

export default function DashboardShell() {
  // The provider owns navigation so any section (or the status strip) can send the user elsewhere
  const [section, navigate] = useSection();
  return (
    <DashboardProvider goTo={navigate}>
      <Shell section={section} navigate={navigate} />
    </DashboardProvider>
  );
}
