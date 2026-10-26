import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ApprovalMode, DiscordRole } from "../../types";
import { useDashboard } from "../../dashboard/DashboardContext";
import { SettingRow, Switch, cx, inputClass } from "../../ui";

const MODES: ApprovalMode[] = ["off", "new", "everyone"];

/** Roles of the Discord server, null while loading, "offline" when the bot is not connected. */
function useGuildRoles(botConnected: boolean): DiscordRole[] | null | "offline" {
  const [roles, setRoles] = useState<DiscordRole[] | null | "offline">(null);
  useEffect(() => {
    if (!botConnected) return;
    let cancelled = false;
    fetch("/api/discord/roles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { roles: DiscordRole[] } | null) => {
        if (!cancelled) setRoles(data ? data.roles : "offline");
      })
      .catch(() => !cancelled && setRoles("offline"));
    return () => {
      cancelled = true;
    };
  }, [botConnected]);
  return botConnected ? roles : "offline";
}

export default function ApprovalSettings() {
  const { t, config, setConfig, botStatus } = useDashboard();
  const roles = useGuildRoles(botStatus.status === "connected");
  const mode = config.approvalMode ?? "new";
  const trusted = config.approvalTrustedRoleIds ?? [];

  const toggleRole = (id: string, on: boolean) =>
    setConfig((c) => ({
      ...c,
      approvalTrustedRoleIds: on
        ? [...(c.approvalTrustedRoleIds ?? []), id]
        : (c.approvalTrustedRoleIds ?? []).filter((r) => r !== id),
    }));

  const modeLabel: Record<ApprovalMode, string> = {
    off: t.approval.modeOff,
    new: t.approval.modeNew,
    everyone: t.approval.modeEveryone,
  };

  return (
    <section
      aria-labelledby="approval-title"
      className="bg-panel border border-line rounded-card p-4 flex flex-col gap-4"
    >
      <div>
        <h2 id="approval-title" className="flex items-center gap-2 text-sm font-bold text-fg">
          <ShieldCheck aria-hidden className="w-4 h-4 text-accent-text" />
          {t.approval.title}
        </h2>
        <p className="text-sm text-fg-muted mt-1">{t.approval.desc}</p>
      </div>

      <div role="radiogroup" aria-labelledby="approval-mode-label" className="flex flex-col gap-1.5">
        <span id="approval-mode-label" className="text-xs font-semibold text-fg-muted">
          {t.approval.mode}
        </span>
        <div className="flex flex-wrap bg-field border border-line rounded-control p-0.5 gap-0.5">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setConfig((c) => ({ ...c, approvalMode: m }))}
              className={cx(
                "flex-1 py-2 px-3 text-sm font-semibold rounded-control border cursor-pointer focus-ring",
                mode === m
                  ? "bg-accent-soft text-accent-text border-accent/40"
                  : "border-transparent text-fg-muted hover:bg-surface-hover hover:text-fg"
              )}
            >
              {modeLabel[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-subtle">{t.approval.modeHelp}</p>
      </div>

      {mode !== "off" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold text-fg-muted">{t.approval.roles}</legend>
            <p className="text-xs text-fg-subtle">{t.approval.rolesHelp}</p>
            {roles === "offline" ? (
              <p className="text-sm text-fg-subtle">{t.approval.rolesOffline}</p>
            ) : roles === null ? null : roles.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t.approval.rolesNone}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {roles.map((role) => {
                  const on = trusted.includes(role.id);
                  return (
                    <li key={role.id}>
                      <label
                        className={cx(
                          "inline-flex items-center gap-2 rounded-control border px-2.5 py-1 text-sm cursor-pointer",
                          on
                            ? "bg-accent-soft text-accent-text border-accent/40"
                            : "border-line text-fg-muted hover:bg-surface-hover"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => toggleRole(role.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-full border border-line-strong"
                          style={{ backgroundColor: role.color }}
                        />
                        <span className="peer-focus-visible:underline">{role.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <div className="divide-y divide-line">
            {mode === "new" && (
              <SettingRow title={t.approval.newCount} description={t.approval.newCountHelp}>
                {({ labelId, descriptionId }) => (
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={config.approvalNewPosterCount ?? 1}
                    onChange={(e) => setConfig((c) => ({ ...c, approvalNewPosterCount: Number(e.target.value) }))}
                    aria-labelledby={labelId}
                    aria-describedby={descriptionId}
                    className={cx(inputClass, "w-24 text-right")}
                  />
                )}
              </SettingRow>
            )}
            <SettingRow title={t.approval.expiry}>
              {({ labelId }) => (
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={config.approvalExpiryMinutes ?? 30}
                    onChange={(e) => setConfig((c) => ({ ...c, approvalExpiryMinutes: Number(e.target.value) }))}
                    aria-labelledby={labelId}
                    className={cx(inputClass, "w-28 text-right pr-12")}
                  />
                  <span
                    aria-hidden
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle pointer-events-none"
                  >
                    {t.approval.expiryUnit}
                  </span>
                </div>
              )}
            </SettingRow>
            <SettingRow title={t.approval.reactions} description={t.approval.reactionsHelp}>
              {({ labelId, descriptionId }) => (
                <Switch
                  checked={config.approvalReactions ?? true}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, approvalReactions: v }))}
                  aria-labelledby={labelId}
                  aria-describedby={descriptionId}
                />
              )}
            </SettingRow>
          </div>
        </>
      )}
    </section>
  );
}
