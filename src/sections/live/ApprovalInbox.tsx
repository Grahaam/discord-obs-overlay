import { useEffect, useState } from "react";
import { Check, ShieldCheck, UserCheck, X } from "lucide-react";
import type { PendingApproval } from "../../types";
import { useDashboard } from "../../dashboard/DashboardContext";
import { useToast } from "../../ui";
import { Button, EmptyState } from "../../ui";

function Media({ alert }: { alert: PendingApproval["alert"] }) {
  const box = "h-24 w-40 shrink-0 rounded-control border border-line bg-field object-cover";
  if (alert.type === "image" && alert.mediaUrl)
    return <img src={alert.mediaUrl} alt="" referrerPolicy="no-referrer" className={box} />;
  if (alert.type === "video" && alert.mediaUrl)
    return <video src={alert.mediaUrl} poster={alert.thumbnailUrl} controls muted preload="metadata" className={box} />;
  if (alert.type === "audio" && alert.mediaUrl) return <audio src={alert.mediaUrl} controls className="w-40" />;
  if (alert.thumbnailUrl) return <img src={alert.thumbnailUrl} alt="" referrerPolicy="no-referrer" className={box} />;
  return (
    <div className={`${box} flex items-center justify-center p-2 text-center text-xs text-fg-subtle`}>
      {alert.title || alert.provider || alert.type}
    </div>
  );
}

function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Alerts from people who are not trusted yet, waiting for the streamer's decision. */
export default function ApprovalInbox() {
  const { t, config, approvals, approve, reject } = useDashboard();
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);

  const reasonLabel = {
    new_poster: t.approval.reasonNewPoster,
    not_trusted_yet: t.approval.reasonNotTrusted,
    everyone: t.approval.reasonEveryone,
  };

  const act = async (id: string, run: () => Promise<boolean>) => {
    setBusy(id);
    const ok = await run();
    setBusy(null);
    if (!ok) toast("error", t.approval.actionFailed);
  };

  const left = (item: PendingApproval) => {
    const minutes = Math.ceil((item.expiresAt - now) / 60_000);
    return minutes <= 1 ? t.approval.expiresSoon : t.approval.expiresIn.replace("{n}", String(minutes));
  };

  const off = (config.approvalMode ?? "new") === "off";

  return (
    <section aria-labelledby="live-approval-title" className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <ShieldCheck aria-hidden className="h-4 w-4 text-accent-text" />
        <h2 id="live-approval-title" className="flex items-center gap-2.5 text-sm font-semibold text-fg">
          {t.approval.inboxTitle}
          <span
            data-testid="approval-count"
            className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-text"
          >
            {approvals.length}
          </span>
        </h2>
      </div>

      {approvals.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title={off ? t.approval.inboxOff : t.approval.inboxEmpty}
        />
      ) : (
        <ul aria-labelledby="live-approval-title" className="divide-y divide-line">
          {approvals.map((item) => (
            <li key={item.id} data-testid="approval-item" className="flex flex-col gap-3 p-4 sm:flex-row">
              <Media alert={item.alert} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  {item.alert.authorAvatar && (
                    <img
                      src={item.alert.authorAvatar}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  )}
                  <span className="truncate text-sm font-semibold text-fg">{item.alert.authorName}</span>
                </div>
                {item.alert.text && <p className="break-words text-sm text-fg-muted">{item.alert.text}</p>}
                <p className="text-xs text-fg-subtle">
                  {reasonLabel[item.reason]} · {left(item)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    className="px-3 py-1.5 text-xs"
                    disabled={busy === item.id}
                    onClick={() => void act(item.id, () => approve(item.id))}
                  >
                    <Check aria-hidden className="h-3.5 w-3.5" />
                    {t.approval.approve}
                  </Button>
                  <Button
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    disabled={busy === item.id}
                    onClick={() => void act(item.id, () => reject(item.id))}
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                    {t.approval.reject}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    disabled={busy === item.id}
                    onClick={() => void act(item.id, () => approve(item.id, true))}
                  >
                    <UserCheck aria-hidden className="h-3.5 w-3.5" />
                    {t.approval.always}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
