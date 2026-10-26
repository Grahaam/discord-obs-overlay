import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pause, Play } from "lucide-react";
import { Button, cx } from "../../ui";
import { useDashboard } from "../../dashboard/DashboardContext";
import { permLabelFor } from "./permLabel";

function Banner({ tone, id, children }: { tone: "danger" | "warn" | "ok"; id?: string; children: React.ReactNode }) {
  const cls = {
    danger: "border-danger/30 bg-danger-soft",
    warn: "border-warn/30 bg-warn-soft",
    ok: "border-ok/30 bg-ok-soft",
  }[tone];
  return (
    <div id={id} role="status" className={cx("flex items-start gap-3 rounded-card border p-4", cls)}>
      {children}
    </div>
  );
}

/** Connection state of the Discord bot, with the overlay pause toggle. */
export default function BotStatusBanner() {
  const { t, botStatus } = useDashboard();
  const [togglingPause, setTogglingPause] = useState(false);
  const paused = botStatus.overlayPaused ?? false;

  const toggleOverlayPause = async () => {
    setTogglingPause(true);
    try {
      await fetch(paused ? "/api/overlay/resume" : "/api/overlay/pause", { method: "POST" });
    } finally {
      setTogglingPause(false);
    }
  };

  // Shared by the "connected" banner and the channel-issue banner, which replaces it:
  // pausing the overlay is still useful while the channel is fixed.
  const pauseButton = (
    <Button variant="secondary" onClick={toggleOverlayPause} disabled={togglingPause} className="shrink-0">
      {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
      {paused ? t.connections.resume : t.connections.pause}
    </Button>
  );

  const describeChannelIssue = () => {
    const issue = botStatus.channelIssue;
    if (!issue) return "";
    if (issue.kind === "not_found") return t.bot.channelNotFound.replace("{id}", issue.channelId);
    const bot = botStatus.botUser.split("#")[0];
    return t.bot.channelNoAccess
      .replace("{bot}", bot)
      .replace("{channel}", issue.channelName ?? issue.channelId)
      .replace("{guild}", issue.guildName ?? "")
      .replace("{role}", issue.botRole ?? bot)
      .replace("{missing}", issue.missing.map((p) => permLabelFor(t, p)).join(", "));
  };

  return (
    <>
      {botStatus.status === "error" && (
        <Banner tone="danger">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger-text">{t.bot.error}</p>
            <p className="mt-1 break-all text-xs text-fg-muted">{botStatus.errorMsg}</p>
          </div>
        </Banner>
      )}

      {botStatus.status === "connected" && botStatus.channelIssue && (
        <Banner tone="warn" id="bot-channel-issue">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn-text" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm font-semibold text-warn-text">{t.bot.channelIssueTitle}</p>
            <p className="text-xs text-fg-muted">{describeChannelIssue()}</p>
            <a
              href={botStatus.channelIssue.inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="self-start rounded-control border border-line-strong px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-hover focus-ring"
            >
              {t.bot.inviteBot}
            </a>
          </div>
          {pauseButton}
        </Banner>
      )}

      {botStatus.status === "connecting" && (
        <Banner tone="warn">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-warn-text" aria-hidden />
          <p className="text-sm font-semibold text-warn-text">{t.bot.connecting}</p>
        </Banner>
      )}

      {botStatus.status === "connected" && !botStatus.channelIssue && (
        <Banner tone={paused ? "warn" : "ok"}>
          {paused ? (
            <Pause className="mt-0.5 h-5 w-5 shrink-0 text-warn-text" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok-text" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className={cx("text-sm font-semibold", paused ? "text-warn-text" : "text-ok-text")}>
              {paused ? t.connections.paused : t.bot.connectedHeader}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">{paused ? t.connections.pausedDesc : t.bot.connectedDesc}</p>
          </div>
          {pauseButton}
        </Banner>
      )}
    </>
  );
}
