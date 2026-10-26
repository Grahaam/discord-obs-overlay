import { useState } from "react";
import {
  Shield,
  ShieldAlert,
  X,
  Lock,
  Link2Off,
  EyeOff,
  Clock,
  Copy,
  Check,
  ScrollText,
  RotateCcw,
  Trash2,
  Plus,
} from "lucide-react";
import { useDashboard } from "../dashboard/DashboardContext";
import { Button, EmptyState, Field, SettingRow, Switch, cx, inputClass } from "../ui";

const CARD = "bg-panel border border-line rounded-card p-4 flex flex-col gap-4";

const STATUS_BORDER: Record<string, string> = {
  approved: "border-l-ok",
  blocked: "border-l-danger",
  censored: "border-l-warn",
};
const STATUS_TEXT: Record<string, string> = {
  approved: "text-fg",
  blocked: "text-danger-text",
  censored: "text-warn-text",
};
const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  video: { label: "vid", cls: "bg-accent-soft text-accent-text" },
  image: { label: "img", cls: "bg-ok-soft text-ok-text" },
  iframe: { label: "web", cls: "bg-surface-hover text-fg-muted" },
};

export default function ModerationSection() {
  const { t, config, setConfig, logs, clearLogs } = useDashboard();
  const [bannedWordInput, setBannedWordInput] = useState("");
  const [roleIdInput, setRoleIdInput] = useState("");
  const [copiedRoleId, setCopiedRoleId] = useState<string | null>(null);

  const bannedWords = config.bannedWords;
  const roleIds = config.allowedRoleIds || [];

  const addBannedWord = () => {
    const clean = bannedWordInput.trim().toLowerCase();
    if (!clean) return;
    setBannedWordInput("");
    if (bannedWords.includes(clean)) return;
    setConfig({ ...config, bannedWords: [...bannedWords, clean] });
  };

  const removeBannedWord = (word: string) =>
    setConfig({ ...config, bannedWords: bannedWords.filter((w) => w !== word) });

  const addRoleId = () => {
    const clean = roleIdInput.trim();
    setRoleIdInput("");
    if (!clean || !/^\d+$/.test(clean) || roleIds.includes(clean)) return;
    setConfig({ ...config, allowedRoleIds: [...roleIds, clean] });
  };

  const removeRoleId = (id: string) => setConfig({ ...config, allowedRoleIds: roleIds.filter((r) => r !== id) });

  const copyRoleId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedRoleId(id);
      setTimeout(() => setCopiedRoleId(null), 2000);
    });
  };

  const replay = (logId: string | number | undefined) =>
    fetch("/api/replay-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId }),
    }).catch(() => {});

  const actionBtn = (active: boolean, tone: "danger" | "warn") =>
    cx(
      "flex-1 py-2 text-sm font-semibold rounded-control border cursor-pointer focus-ring",
      active
        ? tone === "danger"
          ? "bg-danger-soft text-danger-text border-danger/40"
          : "bg-warn-soft text-warn-text border-warn/40"
        : "border-transparent text-fg-muted hover:bg-surface-hover hover:text-fg"
    );

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold text-fg">{t.filter.title}</h1>
        <p className="text-sm text-fg-muted mt-1">{t.filter.desc}</p>
      </header>

      <section aria-labelledby="automod-title" className="rounded-card border border-accent/30 bg-accent-soft p-4">
        <div className="flex gap-3 items-start">
          <Shield aria-hidden className="w-4 h-4 text-accent-text shrink-0 mt-0.5" />
          <div>
            <h2 id="automod-title" className="text-sm font-bold text-accent-text mb-1">
              {t.filter.autoModTitle}
            </h2>
            <p className="text-sm text-fg-muted leading-relaxed">{t.filter.autoModDesc1}</p>
            <p className="text-sm text-fg-subtle mt-1 leading-relaxed">{t.filter.autoModDesc2}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="antispam-title" className={CARD}>
        <h2 id="antispam-title" className="flex items-center gap-2 text-sm font-bold text-fg">
          <ShieldAlert aria-hidden className="w-4 h-4 text-danger-text" />
          {t.filter.antiSpam}
        </h2>
        <div className="divide-y divide-line">
          <SettingRow title={t.filter.blockLinks} icon={<Link2Off aria-hidden className="w-4 h-4" />}>
            {({ labelId }) => (
              <Switch
                checked={config.blockLinks ?? false}
                onCheckedChange={(v) => setConfig({ ...config, blockLinks: v })}
                aria-labelledby={labelId}
              />
            )}
          </SettingRow>
          <SettingRow title={t.filter.blockNSFW} icon={<EyeOff aria-hidden className="w-4 h-4" />}>
            {({ labelId }) => (
              <Switch
                checked={config.blockNSFW ?? false}
                onCheckedChange={(v) => setConfig({ ...config, blockNSFW: v })}
                aria-labelledby={labelId}
              />
            )}
          </SettingRow>
          <SettingRow
            title={t.filter.cooldown}
            description={t.filter.cooldownDesc}
            icon={<Clock aria-hidden className="w-4 h-4" />}
          >
            {({ labelId, descriptionId }) => (
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={config.cooldownSeconds ?? 1}
                  onChange={(e) => setConfig({ ...config, cooldownSeconds: Number(e.target.value) })}
                  aria-labelledby={labelId}
                  aria-describedby={descriptionId}
                  className={cx(inputClass, "w-24 text-right pr-8")}
                />
                <span
                  title={t.filter.cooldownUnit}
                  aria-hidden
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle pointer-events-none"
                >
                  s
                </span>
              </div>
            )}
          </SettingRow>
        </div>
      </section>

      <section aria-labelledby="localfilter-title" className={cx(CARD, "gap-5")}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="localfilter-title" className="flex items-center gap-2 text-sm font-bold text-fg">
            <ShieldAlert aria-hidden className="w-4 h-4 text-danger-text" />
            {t.filter.localFilter}
          </h2>
          {bannedWords.length > 0 && (
            <span className="text-xs text-danger-text bg-danger-soft px-2 py-0.5 rounded-full">
              {bannedWords.length} {t.filter.wordsCount}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Field label={t.filter.bannedWords}>
            {(ids) => (
              <div className="flex gap-2">
                <input
                  {...ids}
                  type="text"
                  placeholder={t.filter.bannedWordsPh}
                  value={bannedWordInput}
                  onChange={(e) => setBannedWordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBannedWord()}
                  className={inputClass}
                />
                <Button variant="secondary" onClick={addBannedWord} aria-label={t.filter.add} title={t.filter.add}>
                  <Plus aria-hidden className="w-4 h-4" />
                </Button>
              </div>
            )}
          </Field>
          {bannedWords.length === 0 ? (
            <p className="text-sm text-fg-subtle text-center py-2">{t.filter.bannedWordsEmpty}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {bannedWords.map((word) => (
                <li
                  key={word}
                  className="inline-flex items-center gap-1.5 bg-danger-soft text-danger-text border border-danger/30 pl-2.5 pr-1 py-1 rounded-control text-sm"
                >
                  {word}
                  <button
                    type="button"
                    onClick={() => removeBannedWord(word)}
                    aria-label={`${t.filter.removeWord}: ${word}`}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-danger/20 cursor-pointer focus-ring"
                  >
                    <X aria-hidden className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div role="group" aria-labelledby="action-label" className="flex flex-col gap-1.5">
          <span id="action-label" className="text-xs font-semibold text-fg-muted">
            {t.filter.action}
          </span>
          <div className="flex bg-field border border-line rounded-control p-0.5 gap-0.5">
            <button
              type="button"
              aria-pressed={config.bannedWordsAction === "block"}
              onClick={() => setConfig({ ...config, bannedWordsAction: "block" })}
              className={actionBtn(config.bannedWordsAction === "block", "danger")}
            >
              {t.filter.actionBlock}
            </button>
            <button
              type="button"
              aria-pressed={config.bannedWordsAction === "censor"}
              onClick={() => setConfig({ ...config, bannedWordsAction: "censor" })}
              className={actionBtn(config.bannedWordsAction === "censor", "warn")}
            >
              {t.filter.actionCensor}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Lock aria-hidden className="w-3 h-3" />
                {t.filter.roleFilter}
              </span>
            }
            hint={t.filter.roleFilterHelp}
          >
            {(ids) => (
              <div className="flex gap-2">
                <input
                  {...ids}
                  type="text"
                  inputMode="numeric"
                  placeholder={t.filter.roleFilterPh}
                  value={roleIdInput}
                  onChange={(e) => setRoleIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRoleId()}
                  className={cx(inputClass, "font-mono")}
                />
                <Button variant="secondary" onClick={addRoleId} aria-label={t.filter.add} title={t.filter.add}>
                  <Plus aria-hidden className="w-4 h-4" />
                </Button>
              </div>
            )}
          </Field>
          {roleIds.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {roleIds.map((id) => (
                <li
                  key={id}
                  className="inline-flex items-center gap-1 bg-accent-soft text-accent-text border border-accent/30 pl-2.5 pr-1 py-1 rounded-control text-sm font-mono"
                >
                  {id}
                  <button
                    type="button"
                    onClick={() => copyRoleId(id)}
                    aria-label={`${t.filter.copyId}: ${id}`}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-accent/20 cursor-pointer focus-ring"
                  >
                    {copiedRoleId === id ? (
                      <Check aria-hidden className="w-3 h-3 text-ok-text" />
                    ) : (
                      <Copy aria-hidden className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRoleId(id)}
                    aria-label={`${t.filter.removeRole}: ${id}`}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-accent/20 cursor-pointer focus-ring"
                  >
                    <X aria-hidden className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="activity-title" className="bg-panel border border-line rounded-card overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <ScrollText aria-hidden className="w-4 h-4 text-accent-text shrink-0" />
          <h2 id="activity-title" className="text-sm font-bold text-fg">
            {t.logs.title}
          </h2>
          {logs.length > 0 && <span className="text-xs text-fg-subtle tabular-nums">{logs.length}</span>}
          <Button variant="danger" className="ml-auto !py-1 text-xs" onClick={() => void clearLogs()}>
            <Trash2 aria-hidden className="w-3.5 h-3.5" />
            {t.logs.clear}
          </Button>
        </div>

        {logs.length === 0 ? (
          <EmptyState icon={<ScrollText className="w-5 h-5" />} title={t.logs.empty} />
        ) : (
          <ul className="overflow-y-auto max-h-96">
            {logs.map((log, i) => {
              const badge = TYPE_BADGE[log.type] ?? { label: "url", cls: "bg-warn-soft text-warn-text" };
              return (
                <li
                  key={log.id ?? i}
                  className={cx(
                    "group flex items-center gap-2 px-3 py-2 border-b border-line border-l-2 hover:bg-surface",
                    STATUS_BORDER[log.status] ?? "border-l-line-strong"
                  )}
                >
                  <time
                    dateTime={new Date(log.timestamp).toISOString()}
                    className="text-fg-subtle shrink-0 tabular-nums font-mono text-xs"
                  >
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {log.thumbnailUrl && (
                    <img
                      src={log.thumbnailUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="shrink-0 w-6 h-6 rounded object-cover border border-line"
                    />
                  )}
                  <span
                    className={cx(
                      "shrink-0 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded uppercase",
                      badge.cls
                    )}
                  >
                    {badge.label}
                  </span>
                  {log.author && (
                    <span className="text-accent-text shrink-0 font-semibold truncate max-w-24 text-xs">
                      {log.author}
                    </span>
                  )}
                  <span className={cx("truncate flex-1 text-xs", STATUS_TEXT[log.status] ?? "text-fg-muted")}>
                    {log.reason}
                  </span>
                  {log.mediaUrl && (
                    <button
                      type="button"
                      onClick={() => void replay(log.id)}
                      aria-label={t.logs.replay}
                      title={t.logs.replay}
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-control bg-accent-soft text-accent-text hover:bg-surface-hover cursor-pointer focus-ring opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <RotateCcw aria-hidden className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
