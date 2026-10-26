import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  HardDrive,
  Sparkles,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { useDashboard } from "../dashboard/DashboardContext";
import { Button, EmptyState, StatusPill, cx } from "../ui";
import type { ServerLogEntry } from "../types";

const CARD = "rounded-card border border-line bg-surface p-4";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-fg-muted";

function StatBar({ pct, label }: { pct: number; label: string }) {
  const color = pct > 80 ? "bg-danger" : pct > 55 ? "bg-warn" : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
    >
      <div className={cx("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatRow({ label, value, pct }: { label: string; value: React.ReactNode; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-mono text-fg">{value}</span>
      </div>
      <StatBar pct={pct} label={label} />
    </div>
  );
}

const LEVEL_STYLES: Record<ServerLogEntry["level"], { border: string; badge: string; text: string; label: string }> = {
  fatal: { border: "border-l-danger", badge: "bg-danger text-on-accent", text: "text-danger-text", label: "fatal" },
  error: {
    border: "border-l-danger",
    badge: "bg-danger-soft text-danger-text",
    text: "text-danger-text",
    label: "err",
  },
  warn: { border: "border-l-warn", badge: "bg-warn-soft text-warn-text", text: "text-warn-text", label: "warn" },
};

function summarize(data: Record<string, unknown>): string {
  return Object.entries(data)
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
    .join(" · ");
}

interface UpdateInfo {
  latest: string;
  current: string;
  downloadUrl: string;
}

function UpdatesCard() {
  const { t } = useDashboard();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/check-update")
      .then((res) => res.json())
      .then((data) => {
        if (alive && data.updateAvailable) setUpdate(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="system-updates" className={cx(CARD, "flex flex-col gap-3")}>
      <h2 id="system-updates" className="flex items-center gap-2 text-base font-semibold text-fg">
        <Sparkles aria-hidden className="h-4 w-4 text-accent-text" />
        {t.system.updatesTitle}
      </h2>
      {update && !dismissed ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg">
            {t.system.updatesAvailable} : <strong className="font-mono">v{update.latest}</strong>{" "}
            <span className="text-fg-muted">
              ({t.system.updatesCurrent} v{update.current})
            </span>
          </p>
          <div className="flex items-center gap-2">
            <a
              href={update.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-strong focus-ring"
            >
              {t.system.updatesDownload}
            </a>
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              {t.system.updatesDismiss}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">{t.system.updatesUpToDate}</p>
      )}
    </section>
  );
}

function ServerLogs() {
  const { t, serverLogs, clearServerLogs } = useDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="system-logs" className={cx(CARD, "flex flex-col gap-3")}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="system-logs" className="text-base font-semibold text-fg">
          {t.system.logsTitle} · {t.system.logsSystem}
        </h2>
        <Button
          variant="ghost"
          onClick={() => void clearServerLogs()}
          disabled={serverLogs.length === 0}
          aria-label={t.system.logsClear}
          title={t.system.logsClear}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-72 min-h-[100px] overflow-y-auto rounded-control border border-line bg-field">
        {serverLogs.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title={t.system.logsEmpty} />
        ) : (
          <ul>
            {serverLogs.map((log) => {
              const hasData = !!log.data && Object.keys(log.data).length > 0;
              const isExpanded = expanded.has(log.id);
              const s = LEVEL_STYLES[log.level];
              const time = new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const summary = (
                <>
                  <span className="mt-0.5 w-10 shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">{time}</span>
                  <span
                    className={cx(
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
                      s.badge
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-xs", s.text, !isExpanded && "truncate")}>{log.msg}</span>
                    {!isExpanded && hasData && (
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-subtle">
                        {summarize(log.data!)}
                      </span>
                    )}
                  </span>
                  {hasData && (
                    <span aria-hidden className="mt-0.5 shrink-0 text-fg-subtle">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </>
              );
              return (
                <li key={log.id} className={cx("border-b border-l-2 border-line last:border-b-0", s.border)}>
                  {hasData ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      title={isExpanded ? t.system.logsCollapse : t.system.logsExpand}
                      onClick={() => toggle(log.id)}
                      className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-surface-hover focus-ring"
                    >
                      {summary}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2 px-3 py-2">{summary}</div>
                  )}
                  {isExpanded && hasData && (
                    <div className="mx-3 mb-2 max-h-48 overflow-auto rounded-control border border-line bg-canvas">
                      <pre className="whitespace-pre-wrap break-all p-2.5 font-mono text-[11px] leading-relaxed text-fg-muted">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function SystemSection() {
  const { t, botStatus } = useDashboard();

  const [cacheBytes, setCacheBytes] = useState(0);
  const [cacheFiles, setCacheFiles] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (botStatus?.health?.cache) {
      setCacheBytes(botStatus.health.cache.size ?? 0); // eslint-disable-line react-hooks/set-state-in-effect
      setCacheFiles(botStatus.health.cache.files ?? 0);
    }
    setLastRefreshed(new Date());
  }, [botStatus]);

  const isConnected = botStatus.status === "connected";
  const cpuLoad = botStatus.health?.system.cpu ?? 0;
  const memUsed = botStatus.health?.system.memory.used ?? 0;
  const memTotal = botStatus.health?.system.memory.total ?? 1;
  const CACHE_MAX = 2 * 1024 * 1024 * 1024;

  const cpuPct = Math.min((cpuLoad / 4) * 100, 100);
  const memPct = Math.min((memUsed / memTotal) * 100, 100);
  const cachePct = Math.min((cacheBytes / CACHE_MAX) * 100, 100);

  async function handleClearCache() {
    if (clearing) return;
    setClearing(true);
    try {
      await fetch("/api/cache/clear", { method: "POST" });
      setCacheBytes(0);
      setCacheFiles(0);
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
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold text-fg">{t.system.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t.health.desc}</p>
      </header>

      <section aria-labelledby="system-health" className="flex flex-col gap-3">
        <h2 id="system-health" className="text-base font-semibold text-fg">
          {t.health.title}
        </h2>

        <div className={cx(CARD, "flex flex-wrap items-center justify-between gap-3")}>
          <div className="flex items-center gap-2.5">
            <Bot aria-hidden className="h-4 w-4 text-fg-muted" />
            <span className={LABEL}>{t.health.botStatus}</span>
          </div>
          <StatusPill tone={isConnected ? "ok" : "danger"} pulse={isConnected}>
            {botStatus.status}
          </StatusPill>
          {botStatus.botUser && (
            <p className="w-full text-xs text-fg-muted">
              <span className="text-fg-subtle">user: </span>
              {botStatus.botUser}
            </p>
          )}
          {botStatus.errorMsg && <p className="w-full break-all text-xs text-danger-text">{botStatus.errorMsg}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={cx(CARD, "flex flex-col gap-3")}>
            <div className="flex items-center gap-2">
              <Cpu aria-hidden className="h-4 w-4 text-fg-muted" />
              <h3 className={LABEL}>{t.health.systemStats}</h3>
            </div>
            <StatRow
              label={t.health.cpuUsage}
              value={
                <>
                  {cpuLoad.toFixed(2)}
                  <span className="text-fg-subtle"> avg</span>
                </>
              }
              pct={cpuPct}
            />
            <StatRow
              label={t.health.memoryUsed}
              value={
                <>
                  {(memUsed / 1024 ** 3).toFixed(1)}
                  <span className="text-fg-subtle"> / {(memTotal / 1024 ** 3).toFixed(1)} GB</span>
                </>
              }
              pct={memPct}
            />
          </div>

          <div className={cx(CARD, "flex flex-col gap-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardDrive aria-hidden className="h-4 w-4 text-fg-muted" />
                <h3 className={LABEL}>{t.health.cacheStats}</h3>
              </div>
              {refreshedTime && (
                <span className="text-[11px] text-fg-subtle">
                  {t.health.lastRefreshed} {refreshedTime}
                </span>
              )}
            </div>
            <StatRow
              label={t.health.cacheSize}
              value={
                <>
                  {(cacheBytes / 1024 ** 2).toFixed(1)}
                  <span className="text-fg-subtle"> / 2048 MB</span>
                </>
              }
              pct={cachePct}
            />
            <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
              <span className="text-fg-muted">{t.health.cacheFiles}</span>
              <span className="font-mono font-bold text-fg">{cacheFiles}</span>
            </div>
            <div className="flex justify-end">
              <Button
                variant={cleared ? "secondary" : "danger"}
                onClick={handleClearCache}
                disabled={clearing}
                className="px-2.5 py-1 text-xs"
              >
                {cleared ? (
                  <Check aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                )}
                {cleared ? t.health.cacheCleared : t.health.clearCache}
              </Button>
            </div>
          </div>

          <div className={cx(CARD, "flex items-center justify-between gap-4 md:col-span-2")}>
            <div className="flex items-center gap-2">
              <VideoIcon aria-hidden className="h-4 w-4 text-fg-muted" />
              <h3 className={LABEL}>{t.health.ytdlpStatus}</h3>
            </div>
            <span className="max-w-[60%] truncate rounded-control border border-line bg-field px-2.5 py-1 font-mono text-xs text-fg">
              {botStatus.health?.ytdlp ?? "—"}
            </span>
          </div>
        </div>
      </section>

      <ServerLogs />
      <UpdatesCard />
    </div>
  );
}
