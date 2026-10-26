import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import type { DiscordGuildInfo } from "../types";
import { Button, Field, StatusPill, cx, inputClass } from "../ui";
import { useDashboard } from "../dashboard/DashboardContext";
import BotStatusBanner from "./connections/BotStatusBanner";
import { permLabelFor } from "./connections/permLabel";
import CookiesPanel from "./connections/CookiesPanel";
import SecretField from "./connections/SecretField";

function Group({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4 rounded-card border border-line bg-panel p-gutter">
      <h2 className="text-base font-bold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-xs text-fg-subtle">
      {children}
    </span>
  );
}

export default function ConnectionsSection() {
  const { t, config, setConfig, applySecrets, botStatus } = useDashboard();

  const [obsPasswordDraft, setObsPasswordDraft] = useState("");
  const [obsTesting, setObsTesting] = useState(false);
  const [obsTestResult, setObsTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  const [cobaltOpen, setCobaltOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState<string | null>(null);

  // Servers/channels the bot can see, for the channel dropdown. Only available once the bot is connected.
  const [guilds, setGuilds] = useState<DiscordGuildInfo[]>([]);
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/discord/channels");
      if (!res.ok) return setGuilds([]);
      setGuilds((await res.json()).guilds ?? []);
    } catch {
      setGuilds([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (botStatus.status === "connected") void loadChannels();
  }, [botStatus.status, loadChannels]);

  const commitChannel = () => {
    if (channelDraft === null) return;
    const next = channelDraft.trim();
    setChannelDraft(null);
    if (next !== config.channelId) setConfig((c) => ({ ...c, channelId: next }));
  };

  const handleObsTest = async () => {
    setObsTesting(true);
    setObsTestResult(null);
    try {
      const res = await fetch("/api/obs/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No password: the server tests with the stored one.
        body: JSON.stringify({
          port: config.obsWebsocketPort ?? 4455,
          ...(obsPasswordDraft ? { password: obsPasswordDraft } : {}),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setObsTestResult({ ok: true, message: t.bot.obsTestOk.replace("{version}", data.obsVersion) });
      } else {
        const message =
          data.errorCode === "unreachable"
            ? t.bot.obsTestUnreachable
            : data.errorCode === "auth_failed"
              ? t.bot.obsTestAuthFailed
              : `${t.bot.obsTestOther} ${data.error ?? ""}`;
        setObsTestResult({ ok: false, message });
      }
    } catch {
      setObsTestResult({ ok: false, message: t.bot.obsTestOther });
    } finally {
      setObsTesting(false);
    }
  };

  const handleShortcutCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!capturingShortcut) return;
    e.preventDefault();
    const key = e.key === " " ? "Space" : e.key;
    setConfig((c) => ({ ...c, stopAlertShortcut: key }));
    setCapturingShortcut(false);
  };

  const quality = config.mediaQuality ?? "1080";
  const channelValue = channelDraft ?? config.channelId;
  const pickedChannel = guilds.some((g) => g.channels.some((c) => c.id === config.channelId)) ? config.channelId : "";

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold text-fg">{t.nav.connections}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t.bot.desc}</p>
      </header>

      <BotStatusBanner />

      <Group title={t.connections.groupDiscord}>
        <SecretField
          label={t.bot.token}
          ariaLabel={t.connections.tokenReplaceLabel}
          placeholder={t.bot.tokenPlaceholder}
          inputId="bot-token-field"
          stored={!!config.discordToken}
          onApply={(v) => applySecrets({ discordToken: v })}
          hint={
            <>
              {t.bot.tokenHelp}{" "}
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noreferrer"
                className="rounded text-accent-text underline hover:text-fg focus-ring"
              >
                {t.bot.devPortal}
              </a>
            </>
          }
        />

        {guilds.length > 0 && (
          <Field label={t.connections.channelPicker}>
            {(aria) => (
              <div className="flex gap-2">
                <select
                  {...aria}
                  value={pickedChannel}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setChannelDraft(null);
                    setConfig((c) => ({ ...c, channelId: e.target.value }));
                  }}
                  className={inputClass}
                >
                  <option value="">{t.bot.channelPick}</option>
                  {guilds.map((g) => (
                    <optgroup key={g.id} label={g.name}>
                      {g.channels.map((c) => (
                        <option key={c.id} value={c.id} disabled={!c.readable}>
                          #{c.name}
                          {c.readable
                            ? ""
                            : ` (${t.bot.channelUnreadable}: ${c.missing.map((p) => permLabelFor(t, p)).join(", ")})`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  onClick={loadChannels}
                  aria-label={t.bot.channelRefresh}
                  title={t.bot.channelRefresh}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
          </Field>
        )}

        <Field label={t.connections.channelManual} hint={t.bot.channelHelp}>
          {(aria) => (
            <input
              {...aria}
              id="bot-channel-field"
              aria-label={t.connections.channelManual}
              type="text"
              placeholder={t.bot.channelPlaceholder}
              value={channelValue}
              onChange={(e) => setChannelDraft(e.target.value)}
              onBlur={commitChannel}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitChannel();
              }}
              className={cx(inputClass, "font-mono")}
            />
          )}
        </Field>
      </Group>

      <Group title={t.connections.groupMedia}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.bot.maxSize} hint={t.bot.maxSizeHelp}>
            {(aria) => (
              <div className="relative">
                <input
                  {...aria}
                  type="number"
                  placeholder="50"
                  value={config.mediaMaxSizeMB}
                  onChange={(e) => setConfig((c) => ({ ...c, mediaMaxSizeMB: Number(e.target.value) }))}
                  className={cx(inputClass, "pr-10")}
                />
                <Unit>MB</Unit>
              </div>
            )}
          </Field>

          <Field label={t.bot.persistentPlays} hint={t.bot.persistentPlaysHelp}>
            {(aria) => (
              <div className="relative">
                <input
                  {...aria}
                  type="number"
                  placeholder="5"
                  min={1}
                  value={config.mediaPersistentPlaysThreshold ?? 5}
                  onChange={(e) => setConfig((c) => ({ ...c, mediaPersistentPlaysThreshold: Number(e.target.value) }))}
                  className={cx(inputClass, "pr-20")}
                />
                <Unit>{t.connections.playsUnit}</Unit>
              </div>
            )}
          </Field>
        </div>

        <div role="group" aria-labelledby="bot-quality-label" className="flex flex-col gap-1.5">
          <span id="bot-quality-label" className="text-xs font-semibold text-fg-muted">
            {t.bot.mediaQuality}
          </span>
          <div className="flex gap-1 rounded-control border border-line bg-field p-1">
            {(["720", "1080", "1440", "2160"] as const).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={quality === q}
                onClick={() => setConfig((c) => ({ ...c, mediaQuality: q }))}
                className={cx(
                  "flex-1 cursor-pointer rounded-control py-1.5 text-sm font-semibold focus-ring",
                  quality === q
                    ? "bg-accent text-on-accent shadow-glow"
                    : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                )}
              >
                {q === "2160" ? "4K" : `${q}p`}
              </button>
            ))}
          </div>
        </div>

        <Field label={t.bot.shortcut} hint={capturingShortcut ? t.bot.shortcutCapturing : t.bot.shortcutHelp}>
          {(aria) => (
            <div className="flex gap-2">
              <input
                {...aria}
                type="text"
                readOnly
                placeholder="Escape"
                value={capturingShortcut ? t.connections.shortcutPrompt : config.stopAlertShortcut || "Escape"}
                onKeyDown={handleShortcutCapture}
                onBlur={() => setCapturingShortcut(false)}
                onClick={() => setCapturingShortcut(true)}
                className={cx(inputClass, "cursor-pointer font-mono", capturingShortcut && "animate-pulse border-warn")}
              />
              {capturingShortcut && (
                <Button
                  variant="ghost"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCapturingShortcut(false)}
                  aria-label={t.connections.shortcutCancel}
                >
                  ✕
                </Button>
              )}
            </div>
          )}
        </Field>
      </Group>

      <Group title={t.connections.groupObs} id="obs-connection-section">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label={t.bot.obsPort}>
            {(aria) => (
              <input
                {...aria}
                type="number"
                min={1}
                max={65535}
                value={config.obsWebsocketPort ?? 4455}
                onChange={(e) => setConfig((c) => ({ ...c, obsWebsocketPort: Number(e.target.value) }))}
                onBlur={(e) => {
                  const port = Math.min(65535, Math.max(1, Math.round(Number(e.target.value)) || 4455));
                  setConfig((c) => ({ ...c, obsWebsocketPort: port }));
                }}
                className={inputClass}
              />
            )}
          </Field>
          <SecretField
            label={t.bot.obsPassword}
            ariaLabel={t.connections.obsPasswordReplaceLabel}
            placeholder={t.bot.obsPasswordPlaceholder}
            stored={!!config.obsWebsocketPassword}
            onApply={(v) => applySecrets({ obsWebsocketPassword: v })}
            onDraftChange={setObsPasswordDraft}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-subtle">{t.bot.obsHelp}</p>
          <Button onClick={handleObsTest} disabled={obsTesting}>
            {obsTesting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t.bot.obsTest}
          </Button>
        </div>
        <div role="status" aria-live="polite">
          {obsTestResult && (
            <StatusPill tone={obsTestResult.ok ? "ok" : "danger"} className="normal-case tracking-normal">
              {obsTestResult.message}
            </StatusPill>
          )}
        </div>
      </Group>

      <Group title={t.connections.groupCookies}>
        <CookiesPanel />
      </Group>

      <Group title={t.connections.groupAdvanced}>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={cobaltOpen}
            aria-controls="cobalt-panel"
            onClick={() => setCobaltOpen((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between rounded text-left text-sm font-semibold text-fg-muted hover:text-fg focus-ring"
          >
            {t.bot.cobaltTitle}
            <ChevronDown
              className={cx("h-4 w-4 transition-transform duration-200", cobaltOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          {cobaltOpen && (
            <div id="cobalt-panel" className="flex flex-col gap-3">
              <Field label={t.connections.cobaltUrl}>
                {(aria) => (
                  <input
                    {...aria}
                    type="url"
                    placeholder="http://localhost:9000/"
                    value={config.cobaltApiUrl || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, cobaltApiUrl: e.target.value }))}
                    className={inputClass}
                  />
                )}
              </Field>
              <Field label={t.connections.cobaltKey} hint={t.bot.cobaltHelp}>
                {(aria) => (
                  <input
                    {...aria}
                    type="password"
                    autoComplete="off"
                    placeholder={t.bot.cobaltKeyPlaceholder}
                    value={config.cobaltApiKey || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, cobaltApiKey: e.target.value }))}
                    className={inputClass}
                  />
                )}
              </Field>
            </div>
          )}
        </div>
      </Group>
    </div>
  );
}
