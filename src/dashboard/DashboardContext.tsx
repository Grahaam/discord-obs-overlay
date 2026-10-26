import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { BotStatus, LogEntry, PendingApproval, ServerLogEntry, UIConfig } from "../types";
import { useApprovals } from "../hooks/useApprovals";
import { locales, type Language } from "../locales";
import { useQueueStore } from "../store/queueStore";
import { ToastProvider, useToast } from "../ui";
import { useSettings, type SaveState, type SecretPatch, type SettingsNotifier } from "./useSettings";
import type { SectionId } from "./sections";

/** Mirrors SetupStatus in server/setupStatus.ts (only the fields the UI reads). */
export interface SetupStatus {
  bot: boolean;
  overlay: boolean;
  obs: boolean;
  testAlertSeen: boolean;
  cookies: boolean;
  details: {
    botStatus: string;
    channelConfigured: boolean;
    channelIssue: unknown | null;
    overlayClients: number;
    obsErrorCode: "unreachable" | "auth_failed" | "other" | null;
    obsError: string | null;
    obsVersion: string | null;
  };
}

export interface DashboardState {
  t: (typeof locales)["fr"];
  config: UIConfig;
  /** State setter whose changes are autosaved (debounced). */
  setConfig: Dispatch<SetStateAction<UIConfig>>;
  /** Saves immediately a config the caller already built. */
  saveNow: (next: UIConfig) => Promise<void>;
  /** Replaces the Discord token / OBS password. The only way to change a secret. */
  applySecrets: (patch: SecretPatch) => Promise<void>;
  saveState: SaveState;
  botStatus: BotStatus;
  reconnectBot: () => Promise<void>;
  setup: SetupStatus | null;
  logs: LogEntry[];
  serverLogs: ServerLogEntry[];
  clearLogs: () => Promise<void>;
  clearServerLogs: () => Promise<void>;
  goTo: (section: SectionId) => void;
  /** Alerts held for the streamer's approval, oldest first. */
  approvals: PendingApproval[];
  approve: (id: string, always?: boolean) => Promise<boolean>;
  reject: (id: string) => Promise<boolean>;
  /** Re-reads settings, bot status and logs from the server. */
  refresh: () => Promise<void>;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return ctx;
}

const post = (url: string) => fetch(url, { method: "POST" }).catch((err) => console.error(err));

/** Hands the toast function to useSettings, which is created above the ToastProvider (it picks the language). */
function ToastBridge({ register, t }: { register: (n: SettingsNotifier) => void; t: DashboardState["t"] }) {
  const toast = useToast();
  useEffect(() => {
    register({
      saved: () => toast("success", t.save.saved),
      secretSaved: () => toast("success", t.secret.applied),
      failed: (message) => toast("error", `${t.save.error}: ${message}`),
    });
  }, [register, toast, t]);
  return null;
}

export function DashboardProvider({ goTo, children }: { goTo: (section: SectionId) => void; children: ReactNode }) {
  const { socket, wsStatus } = useQueueStore();
  const settings = useSettings();
  const { config, reload } = settings;
  const { approvals, approve, reject } = useApprovals();

  const [botStatus, setBotStatus] = useState<BotStatus>({ status: "disconnected", botUser: "", errorMsg: "" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  const t = locales[(config.language as Language) ?? "fr"] ?? locales.fr;

  const fetchBotStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bot-status");
      if (res.ok) setBotStatus(await res.json());
    } catch (err) {
      console.error("Dashboard failed pulling bot status:", err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const [logRes, srvLogRes] = await Promise.all([fetch("/api/logs"), fetch("/api/server-logs")]);
      if (logRes.ok) setLogs(await logRes.json());
      if (srvLogRes.ok) setServerLogs(await srvLogRes.json());
    } catch (err) {
      console.error("Dashboard failed pulling logs:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([reload(), fetchBotStatus(), fetchLogs()]);
  }, [reload, fetchBotStatus, fetchLogs]);

  const fetchSetup = useCallback(async () => {
    try {
      const res = await fetch("/api/setup-status");
      if (res.ok) setSetup(await res.json());
    } catch {
      // server restarting: keep the last known status
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBotStatus();
    void fetchLogs();
    void fetchSetup();
    const botTimer = setInterval(fetchBotStatus, 10_000);
    const setupTimer = setInterval(fetchSetup, 5_000);
    return () => {
      clearInterval(botTimer);
      clearInterval(setupTimer);
    };
  }, [fetchBotStatus, fetchLogs, fetchSetup]);

  // Live log events. Named handlers allow precise cleanup without stripping other listeners; initial_logs /
  // initial_server_logs are pushed by the server on connect, the HTTP fetch above covers the first load.
  useEffect(() => {
    if (wsStatus !== "connected" || !socket) return;

    const onNewLog = (log: LogEntry) =>
      setLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [log, ...prev].slice(0, 500)));
    const onInitialLogs = (incoming: LogEntry[]) =>
      setLogs((prev) => {
        const known = new Set(prev.map((l) => l.id));
        const fresh = incoming.filter((l) => !known.has(l.id));
        return fresh.length === 0 ? prev : [...fresh, ...prev].slice(0, 500);
      });
    const onLogsCleared = () => setLogs([]);
    const onNewServerLog = (log: ServerLogEntry) =>
      setServerLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [log, ...prev].slice(0, 200)));
    const onInitialServerLogs = (incoming: ServerLogEntry[]) =>
      setServerLogs((prev) => {
        const known = new Set(prev.map((l) => l.id));
        const fresh = incoming.filter((l) => !known.has(l.id));
        return fresh.length === 0 ? prev : [...fresh, ...prev].slice(0, 200);
      });
    const onServerLogsCleared = () => setServerLogs([]);

    socket.on("new_log", onNewLog);
    socket.on("initial_logs", onInitialLogs);
    socket.on("logs_cleared", onLogsCleared);
    socket.on("new_server_log", onNewServerLog);
    socket.on("initial_server_logs", onInitialServerLogs);
    socket.on("server_logs_cleared", onServerLogsCleared);
    return () => {
      socket.off("new_log", onNewLog);
      socket.off("initial_logs", onInitialLogs);
      socket.off("logs_cleared", onLogsCleared);
      socket.off("new_server_log", onNewServerLog);
      socket.off("initial_server_logs", onInitialServerLogs);
      socket.off("server_logs_cleared", onServerLogsCleared);
    };
  }, [socket, wsStatus]);

  // Global "skip current alert" shortcut (ignored while typing in a field)
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const configKey = config.stopAlertShortcut || "Escape";
      const matches =
        e.key.toLowerCase() === configKey.toLowerCase() ||
        e.code.toLowerCase() === configKey.toLowerCase() ||
        (configKey.toLowerCase() === "space" && e.key === " ");
      if (matches) {
        e.preventDefault();
        await post("/api/skip-alert");
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [config.stopAlertShortcut]);

  const reconnectBot = useCallback(async () => {
    try {
      setBotStatus((prev) => ({ ...prev, status: "connecting" }));
      const res = await fetch("/api/bot-reconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) void refresh();
    } catch (err) {
      console.error(err);
    }
  }, [refresh]);

  const value = useMemo<DashboardState>(
    () => ({
      t,
      config,
      setConfig: settings.setConfig,
      saveNow: settings.saveNow,
      applySecrets: settings.applySecrets,
      saveState: settings.saveState,
      botStatus,
      reconnectBot,
      setup,
      logs,
      serverLogs,
      clearLogs: async () => void (await post("/api/logs/clear")),
      clearServerLogs: async () => void (await post("/api/server-logs/clear")),
      goTo,
      approvals,
      approve,
      reject,
      refresh,
    }),
    [t, config, settings, botStatus, reconnectBot, setup, logs, serverLogs, goTo, approvals, approve, reject, refresh]
  );

  return (
    <DashboardContext.Provider value={value}>
      <ToastProvider closeLabel={t.save.close} regionLabel={t.save.notifications}>
        <ToastBridge register={settings.setNotifier} t={t} />
        {children}
      </ToastProvider>
    </DashboardContext.Provider>
  );
}
