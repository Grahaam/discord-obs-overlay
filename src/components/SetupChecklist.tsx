import { useEffect, useState } from "react";
import { Check, Loader2, Copy, CheckCircle2, Circle } from "lucide-react";
import { locales } from "../locales";
import { Button, Dialog } from "../ui";

type Translations = (typeof locales)["fr"];

// Mirrors SetupStatus in server/setupStatus.ts (only the fields the UI reads)
interface SetupStatus {
  bot: boolean;
  overlay: boolean;
  obs: boolean;
  testAlertSeen: boolean;
  cookies: boolean;
  details: {
    botStatus: string;
    channelConfigured: boolean;
    channelIssue: unknown | null;
    obsErrorCode: "unreachable" | "auth_failed" | "other" | null;
    obsError: string | null;
    obsVersion: string | null;
  };
}

const POLL_MS = 2000;

function Row({
  done,
  loading,
  title,
  badge,
  children,
}: {
  done: boolean;
  loading: boolean;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 text-left">
      <span className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-ok" aria-hidden />
        ) : loading ? (
          <Loader2 className="w-5 h-5 text-fg-subtle animate-spin" aria-hidden />
        ) : (
          <Circle className="w-5 h-5 text-fg-subtle" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-fg">
          {title}
          {badge && (
            <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-fg-muted border border-line-strong rounded px-1.5 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-fg-muted leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

const linkBtn = "mt-2 text-xs font-semibold text-accent-text underline cursor-pointer rounded focus-ring";

/**
 * The checklist rows, shared by the modal and the inline card on the Live page.
 * `onGoToConnections` navigates to the Connections section; the first existing id of
 * the row's targets is then scrolled into view.
 */
export function SetupChecklistBody({
  t,
  onGoToConnections,
  onNavigated,
  onAllDone,
}: {
  t: Translations;
  onGoToConnections: () => void;
  /** Called right before navigating (the modal closes itself here) */
  onNavigated?: () => void;
  /** Reports whether every required step is ticked */
  onAllDone?: (allDone: boolean) => void;
}) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [testAlertId, setTestAlertId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  // Real URL of this instance: the port is dynamic under Electron
  const overlayUrl = `${window.location.origin}/overlay`;

  // Poll while mounted. Re-runs when the test alert id changes so the new id is checked immediately.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const qs = testAlertId ? `?testAlertId=${encodeURIComponent(testAlertId)}` : "";
        const res = await fetch(`/api/setup-status${qs}`);
        if (res.ok && !cancelled) setStatus(await res.json());
      } catch {
        // server briefly unreachable: keep the last known state and retry
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [testAlertId]);

  const sendTestAlert = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/trigger-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data?.payload?.id) setTestAlertId(data.payload.id);
    } catch {
      // the step simply stays unticked
    } finally {
      setSending(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Both the bot and the OBS connection settings live in the Connections section.
  // After it has rendered, scroll to the first of `targetIds` that exists.
  const goToConnections = (...targetIds: string[]) => {
    onNavigated?.();
    onGoToConnections();
    setTimeout(() => {
      for (const id of targetIds) {
        const el = document.getElementById(id);
        if (el) return el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const d = status?.details;
  const botHint = !status
    ? ""
    : status.bot
      ? t.setup.botOk
      : d?.channelIssue
        ? t.setup.botChannelIssue
        : !d?.channelConfigured
          ? t.setup.botNoChannel
          : t.setup.botNotConnected;
  const obsHint = !status
    ? ""
    : status.obs
      ? t.setup.obsOk.replace("{version}", d?.obsVersion ?? "")
      : d?.obsErrorCode === "auth_failed"
        ? t.setup.obsAuthFailed
        : d?.obsErrorCode === "other"
          ? `${t.setup.obsOther} ${d.obsError ?? ""}`
          : t.setup.obsUnreachable;

  const allDone = !!status && status.bot && status.overlay && status.obs && status.testAlertSeen;
  const loading = !status;

  useEffect(() => {
    onAllDone?.(allDone);
  }, [allDone, onAllDone]);

  return (
    <>
      <ul className="flex flex-col gap-5">
        <Row done={!!status?.bot} loading={loading} title={t.setup.botTitle}>
          {botHint}
          {status && !status.bot && (
            <div>
              <button
                type="button"
                onClick={() =>
                  goToConnections("bot-channel-issue", d?.channelConfigured ? "bot-token-field" : "bot-channel-field")
                }
                className={linkBtn}
              >
                {t.setup.botGo}
              </button>
            </div>
          )}
        </Row>

        <Row done={!!status?.overlay} loading={loading} title={t.setup.overlayTitle}>
          {status?.overlay ? t.setup.overlayOk : t.setup.overlayWaiting}
          <div className="flex items-center gap-2 mt-2">
            <input
              readOnly
              aria-label={t.setup.overlayTitle}
              value={overlayUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 bg-field border border-line rounded-control px-2.5 py-1.5 text-[11px] font-mono text-accent-text focus-ring"
            />
            <Button variant="primary" onClick={copyUrl} className="shrink-0 gap-1 px-2.5 py-1.5 text-[11px]">
              {copied ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : <Copy className="w-3 h-3" aria-hidden />}
              {copied ? t.display.copied : t.display.copy}
            </Button>
          </div>
          {!status?.overlay && <p className="mt-2 text-fg-muted">{t.setup.overlayHow}</p>}
          <p className="mt-2 text-fg-subtle">{t.setup.overlayUrlChanges}</p>
        </Row>

        <Row done={!!status?.obs} loading={loading} title={t.setup.obsTitle}>
          {obsHint}
          {status && !status.obs && (
            <div>
              <button type="button" onClick={() => goToConnections("obs-connection-section")} className={linkBtn}>
                {t.setup.obsGo}
              </button>
            </div>
          )}
        </Row>

        <Row done={!!status?.testAlertSeen} loading={loading} title={t.setup.testTitle}>
          {status?.testAlertSeen ? t.setup.testOk : status?.overlay ? t.setup.testWaiting : t.setup.testNeedsOverlay}
          <div className="mt-2">
            <Button variant="primary" onClick={sendTestAlert} disabled={sending} className="px-3 py-1.5 text-xs">
              {t.setup.testButton}
            </Button>
          </div>
        </Row>

        {/* Optional: not counted in allDone */}
        <Row done={!!status?.cookies} loading={loading} title={t.setup.cookiesTitle} badge={t.setup.cookiesOptional}>
          {status?.cookies ? t.setup.cookiesOk : t.setup.cookiesMissing}
          {status && !status.cookies && (
            <div>
              <button type="button" onClick={() => goToConnections("cookies-section")} className={linkBtn}>
                {t.setup.cookiesGo}
              </button>
            </div>
          )}
        </Row>
      </ul>

      <div role="status" aria-live="polite">
        {allDone && (
          <div className="mt-6 flex items-center gap-2 text-sm font-bold text-ok-text">
            <Check className="w-4 h-4" aria-hidden />
            {t.setup.allDone}
          </div>
        )}
      </div>
    </>
  );
}

interface SetupChecklistProps {
  onClose: () => void;
  onGoToConnections: () => void;
  t: Translations;
}

export default function SetupChecklist({ onClose, onGoToConnections, t }: SetupChecklistProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.setup.title}
      description={t.setup.subtitle}
      closeLabel={t.setup.close}
    >
      <SetupChecklistBody t={t} onGoToConnections={onGoToConnections} onNavigated={onClose} />
      <Button variant="secondary" onClick={onClose} className="mt-6 w-full py-3">
        {t.setup.close}
      </Button>
    </Dialog>
  );
}
