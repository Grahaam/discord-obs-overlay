import { useEffect, useState } from "react";
import { X, Check, Loader2, Copy, CheckCircle2, Circle } from "lucide-react";
import { locales } from "../locales";

interface SetupChecklistProps {
  onClose: () => void;
  setActiveTab: (tab: "credentials") => void;
  t: (typeof locales)["fr"];
}

// Mirrors SetupStatus in server/setupStatus.ts (only the fields the UI reads)
interface SetupStatus {
  bot: boolean;
  overlay: boolean;
  obs: boolean;
  testAlertSeen: boolean;
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
  children,
}: {
  done: boolean;
  loading: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 text-left">
      <span className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        ) : loading ? (
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        ) : (
          <Circle className="w-5 h-5 text-white/30" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-xs text-slate-300 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

export default function SetupChecklist({ onClose, setActiveTab, t }: SetupChecklistProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [testAlertId, setTestAlertId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  // Real URL of this instance: the port is dynamic under Electron
  const overlayUrl = `${window.location.origin}/overlay`;

  // Poll while open. Re-runs when the test alert id changes so the new id is checked immediately.
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

  // Both the bot and the OBS connection settings live in the "Discord Bot" tab
  const goToBotTab = () => {
    setActiveTab("credentials");
    onClose();
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

  const linkBtn = "mt-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200 underline cursor-pointer";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#0a0a0f] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
        <button
          onClick={onClose}
          aria-label={t.setup.close}
          className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition cursor-pointer bg-white/5 rounded-full hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-2xl font-black text-white font-display uppercase tracking-tight mb-1">{t.setup.title}</h2>
        <p className="text-sm text-slate-400 mb-6">{t.setup.subtitle}</p>

        <ul className="flex flex-col gap-5">
          <Row done={!!status?.bot} loading={loading} title={t.setup.botTitle}>
            {botHint}
            {status && !status.bot && (
              <div>
                <button onClick={goToBotTab} className={linkBtn}>
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
                value={overlayUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-indigo-300 focus:outline-none"
              />
              <button
                onClick={copyUrl}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? t.display.copied : t.display.copy}
              </button>
            </div>
            {!status?.overlay && <p className="mt-2 text-slate-400">{t.setup.overlayHow}</p>}
          </Row>

          <Row done={!!status?.obs} loading={loading} title={t.setup.obsTitle}>
            {obsHint}
            {status && !status.obs && (
              <div>
                <button onClick={goToBotTab} className={linkBtn}>
                  {t.setup.obsGo}
                </button>
              </div>
            )}
          </Row>

          <Row done={!!status?.testAlertSeen} loading={loading} title={t.setup.testTitle}>
            {status?.testAlertSeen ? t.setup.testOk : status?.overlay ? t.setup.testWaiting : t.setup.testNeedsOverlay}
            <div>
              <button
                onClick={sendTestAlert}
                disabled={sending}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer"
              >
                {t.setup.testButton}
              </button>
            </div>
          </Row>
        </ul>

        {allDone && (
          <div className="mt-6 flex items-center gap-2 text-sm font-bold text-emerald-400">
            <Check className="w-4 h-4" />
            {t.setup.allDone}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-wide transition cursor-pointer"
        >
          {t.setup.close}
        </button>
      </div>
    </div>
  );
}
