import { useState, type ReactNode } from "react";
import { CheckCircle2, Copy, ExternalLink, ListMusic, Monitor, SkipForward } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDashboard } from "../dashboard/DashboardContext";
import { useQueueStore } from "../store/queueStore";
import NowPlayingPreview from "../components/NowPlayingPreview";
import { SortableQueueItem } from "../components/SortableQueueItem";
import { SetupChecklistBody } from "../components/SetupChecklist";
import { useAccessUrl } from "../lib/useAccessUrl";
import { Button, EmptyState, cx } from "../ui";
import ApprovalInbox from "./live/ApprovalInbox";

function Card({
  icon,
  title,
  actions,
  children,
  labelledBy,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  labelledBy: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className={cx("rounded-card border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id={labelledBy} className="flex items-center gap-2.5 text-sm font-semibold text-fg">
          <span aria-hidden className="text-accent-text">
            {icon}
          </span>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function UrlRow({ label, path }: { label: string; path: string }) {
  const { t } = useDashboard();
  const [copied, setCopied] = useState(false);
  // Real URL of this instance (dynamic port under Electron), with the access key OBS needs
  const url = useAccessUrl(path);
  const inputId = `obs-url-${path.slice(1)}`;

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        // the URL stays selectable in the field next to the button
      });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={inputId} className="w-16 shrink-0 truncate text-xs font-medium text-fg-muted">
        {label}
      </label>
      <input
        id={inputId}
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
        onClick={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 cursor-text truncate rounded-control border border-line bg-field px-2.5 py-1.5 font-mono text-xs text-accent-text focus-ring"
      />
      <Button
        variant={copied ? "secondary" : "primary"}
        onClick={copy}
        aria-label={`${copied ? t.display.copied : t.display.copy}: ${label}`}
        className={cx(
          "shrink-0 gap-1 px-2.5 py-1.5 text-xs",
          copied && "border-ok/40 bg-ok-soft text-ok-text hover:border-ok/40"
        )}
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        <span aria-live="polite">{copied ? t.display.copied : t.display.copy}</span>
      </Button>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-fg-muted">
          <span
            aria-hidden
            className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-text"
          >
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default function LiveSection() {
  const { t, goTo, setup, config, approvals } = useDashboard();
  const { queue: pendingQueue, nowPlaying, reorder } = useQueueStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pendingQueue.findIndex((i) => i.id === active.id);
    const newIndex = pendingQueue.findIndex((i) => i.id === over.id);
    try {
      await reorder(oldIndex, newIndex);
    } catch (err) {
      console.error("Failed to reorder queue:", err);
    }
  };

  const setupIncomplete = !!setup && !(setup.bot && setup.overlay && setup.obs && setup.testAlertSeen);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t.live.title}</h1>

      {/* Pending approvals first: a viewer is waiting on them */}
      {(approvals.length > 0 || (config.approvalMode ?? "new") !== "off") && <ApprovalInbox />}

      {setupIncomplete && (
        <Card icon={<ListMusic className="h-4 w-4" />} title={t.setup.title} labelledBy="live-setup-title">
          <div className="p-4">
            <p className="mb-4 text-sm text-fg-muted">{t.setup.subtitle}</p>
            <SetupChecklistBody t={t} onGoToConnections={() => goTo("connections")} />
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card icon={<Monitor className="h-4 w-4" />} title={t.live.previewTitle} labelledBy="live-preview-title">
            <div className="relative w-full overflow-hidden rounded-b-card" style={{ aspectRatio: "16/9" }}>
              <NowPlayingPreview alert={nowPlaying} />
            </div>
          </Card>

          <Card
            icon={<ListMusic className="h-4 w-4" />}
            labelledBy="live-queue-title"
            title={
              <>
                {t.live.queueTitle}
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-text">
                  {pendingQueue.length}
                </span>
              </>
            }
            actions={
              pendingQueue.length > 0 && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => fetch("/api/skip-alert", { method: "POST" })}
                    className="px-2.5 py-1 text-xs"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden /> {t.live.skip}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => fetch("/api/queue/clear", { method: "POST" })}
                    className="px-2.5 py-1 text-xs"
                  >
                    {t.live.clear}
                  </Button>
                </div>
              )
            }
          >
            {pendingQueue.length === 0 ? (
              <EmptyState icon={<ListMusic className="h-6 w-6" />} title={t.live.queueEmpty} />
            ) : (
              <div className="max-h-96 overflow-y-auto p-3">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={pendingQueue.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <ul aria-labelledby="live-queue-title" className="space-y-1.5">
                      {pendingQueue.map((item) => (
                        <SortableQueueItem
                          key={item.id}
                          item={item}
                          dragLabel={t.live.dragHandle}
                          removeLabel={t.live.removeItem}
                          onRemove={(id) =>
                            fetch("/api/queue/remove-item", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id }),
                            })
                          }
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <Card icon={<ExternalLink className="h-4 w-4" />} title={t.display.urlTitle} labelledBy="live-urls-title">
            <div className="flex flex-col gap-4 p-4">
              <p className="text-xs leading-relaxed text-fg-muted">{t.display.urlDesc}</p>

              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
                  {t.display.overlaySection}
                </h3>
                <UrlRow label={t.display.overlayLabel} path="/overlay" />
                <Steps steps={[t.display.step1, t.display.step2, t.display.step3]} />
              </div>

              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
                  {t.display.dockSection}
                </h3>
                <UrlRow label={t.display.dockLabel} path="/dock" />
                <UrlRow label={t.display.statusLabel} path="/status" />
                <Steps steps={[t.display.dockStep1, t.display.dockStep2, t.display.dockStep3]} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
