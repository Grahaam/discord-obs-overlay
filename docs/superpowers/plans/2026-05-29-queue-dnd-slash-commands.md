# Queue DnD + Discord Slash Commands + Dock Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two OBSQueueDock bugs (empty-on-load + no reconnect), add drag-and-drop queue reordering, and add `/skip` (admin/mod only) and `/queue` Discord slash commands.

**Architecture:** OBSQueueDock gets a full rewrite using @dnd-kit/sortable for DnD — optimistic local reorder on drag end, then POST to existing `/api/queue/force-update`. Discord slash commands are registered guild-scoped on `clientReady` using Discord.js REST, handled via `interactionCreate` in `discordBotManager.ts`.

**Tech Stack:** React 19, @dnd-kit/core + @dnd-kit/sortable, Discord.js 14 (REST + SlashCommandBuilder + EmbedBuilder)

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable` |
| `src/components/OBSQueueDock.tsx` | Full rewrite — fix socket init/reconnect + DnD |
| `server/discordBotManager.ts` | Add slash command registration + interactionCreate handler |

---

### Task 1: Install @dnd-kit dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && npm install @dnd-kit/core @dnd-kit/sortable
```

Expected: Both packages added to `dependencies` in `package.json`, no peer-dep errors.

- [ ] **Step 2: Verify types resolve**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && npx tsc --noEmit 2>&1 | head -20
```

Expected: Zero new errors (existing errors irrelevant — we just need no missing-module errors for `@dnd-kit/*`).

- [ ] **Step 3: Commit**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && git add package.json package-lock.json && git commit -m "chore: add @dnd-kit/core and @dnd-kit/sortable"
```

---

### Task 2: Rewrite OBSQueueDock — fix bugs + add drag-and-drop

**Files:**
- Modify: `src/components/OBSQueueDock.tsx`

- [ ] **Step 1: Replace entire file with this implementation**

```tsx
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { GripVertical, X, SkipForward, Trash2 } from "lucide-react";
import { AlertPayload } from "../types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableQueueItem({
  item,
  onRemove,
}: {
  item: AlertPayload;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white/5 p-2 rounded flex items-center gap-2">
      <button
        {...attributes}
        {...listeners}
        className="text-white/30 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="flex-1 truncate">
        <div className="text-white text-[10px] font-bold truncate">{item.title || item.authorName}</div>
        {item.title && <div className="text-white/40 text-[9px] truncate">{item.authorName}</div>}
      </div>
      <button onClick={() => onRemove(item.id)} className="text-red-400">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function OBSQueueDock() {
  const [queue, setQueue] = useState<AlertPayload[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      socket.emit("get_initial_state");
    });

    socket.on("initial_state", setQueue);
    socket.on("force_queue_update", setQueue);
    socket.on("new_alert", (alert: AlertPayload) => setQueue((prev) => [...prev, alert]));
    socket.on("remove_queue_item", (itemId: string) =>
      setQueue((prev) => prev.filter((i) => i.id !== itemId))
    );
    socket.on("clear_queue", () => setQueue([]));

    return () => {
      socket.close();
    };
  }, []);

  const handleAction = async (endpoint: string, body?: unknown) => {
    await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((item) => item.id === active.id);
    const newIndex = queue.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(queue, oldIndex, newIndex);

    setQueue(reordered);
    handleAction("queue/force-update", { queue: reordered.map((item) => ({ id: item.id })) });
  };

  return (
    <div className="bg-[#0a0a0f] text-white min-h-screen p-3 font-sans text-xs">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => handleAction("skip-alert")}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-2 rounded flex items-center justify-center gap-1"
        >
          <SkipForward className="w-3 h-3" /> Skip
        </button>
        <button
          onClick={() => handleAction("queue/clear")}
          className="bg-red-900/30 hover:bg-red-900/50 p-2 rounded"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={queue.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {queue.map((item) => (
              <SortableQueueItem
                key={item.id}
                item={item}
                onRemove={(id) => handleAction("queue/remove-item", { id })}
              />
            ))}
            {queue.length === 0 && <div className="text-center text-white/20 py-8">Queue Empty</div>}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && npx tsc --noEmit 2>&1 | grep "OBSQueueDock"
```

Expected: No output (zero errors in that file).

- [ ] **Step 3: Commit**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && git add src/components/OBSQueueDock.tsx && git commit -m "fix(dock): init queue on connect, add reconnect, implement drag-and-drop reorder"
```

---

### Task 3: Add Discord slash commands

**Files:**
- Modify: `server/discordBotManager.ts`

- [ ] **Step 1: Replace entire file with this implementation**

```typescript
import {
  Client,
  GatewayIntentBits,
  Message,
  Interaction,
  PermissionFlagsBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { Server as SocketServer } from "socket.io";
import { settingsManager } from "./settingsManager.js";
import { logManager } from "./logManager.js";
import { processBannedWords } from "./bannedWords.js";
import { resolveMediaFromLink } from "./mediaParser.js";
import { alertManager } from "./alertManager.js";
import { addJob } from "./mediaWorkerQueue.js";
import { logger } from "./logger.js";

export class DiscordBotManager {
  private client: Client | null = null;
  private io: SocketServer | null = null;
  public status: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  public errorMsg: string = "";
  public botUser: string = "";
  private lastUserRequestTimes: Record<string, number> = {};
  private guildId: string = "";

  public setIo(io: SocketServer) {
    this.io = io;
  }

  public async connectBot(token: string, channelId: string) {
    await this.shutdown();

    if (!token || !channelId) {
      this.status = "disconnected";
      this.botUser = "";
      return;
    }

    this.status = "connecting";
    this.errorMsg = "";
    logger.info({ channelId }, "Starting Discord Client login");

    try {
      this.client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      });

      this.client.once("clientReady", async (readyClient) => {
        this.status = "connected";
        this.botUser = readyClient.user.tag;
        this.errorMsg = "";
        logger.info({ botUser: this.botUser }, "Discord bot connected");
        await this.registerSlashCommands(readyClient.user.id, token, channelId);
      });

      this.client.on("error", (err: Error) => {
        logger.error({ err }, "Discord WebSocket exception");
        this.status = "error";
        this.errorMsg = err.message || "Discord WebSocket exception";
      });

      this.client.on("interactionCreate", async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;

        try {
          if (interaction.commandName === "skip") {
            const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
            if (!hasPermission) {
              await interaction.reply({
                content: "❌ You need Manage Messages permission to skip alerts.",
                ephemeral: true,
              });
              return;
            }
            if (this.io) {
              this.io.emit("skip_alert");
            }
            await interaction.reply({ content: "⏭️ Alert skipped.", ephemeral: true });
            return;
          }

          if (interaction.commandName === "queue") {
            const alerts = alertManager.getAlerts();
            if (alerts.length === 0) {
              await interaction.reply({ content: "📭 Queue is empty.", ephemeral: true });
              return;
            }
            const embed = new EmbedBuilder()
              .setTitle(`Alert Queue (${alerts.length} item${alerts.length === 1 ? "" : "s"})`)
              .setColor(0x6366f1)
              .setDescription(
                alerts.map((a, i) => `${i + 1}. **${a.title || a.authorName}** — ${a.type}`).join("\n")
              );
            await interaction.reply({ embeds: [embed], ephemeral: true });
          }
        } catch (err) {
          logger.error({ err }, "Exception in interactionCreate handler");
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ Internal error.", ephemeral: true }).catch(() => {});
          }
        }
      });

      this.client.on("messageCreate", async (message: Message) => {
        try {
          if (message.author.bot) return;
          if (message.channelId !== channelId) return;

          const cooldown = settingsManager.settings.cooldownSeconds || 0;
          if (cooldown > 0) {
            const lastTime = this.lastUserRequestTimes[message.author.id] || 0;
            const now = Date.now();
            const diff = (now - lastTime) / 1000;
            if (diff < cooldown) {
              logger.warn({ author: message.author.username, cooldown, diff }, "Blocked message due to cooldown");
              logManager.addLog({
                author: message.author.username,
                text: message.content,
                type: "image",
                mediaUrl: "",
                status: "blocked",
                reason: `Cooldown (wait ${Math.ceil(cooldown - diff)}s)`,
              });
              return;
            }
          }
          this.lastUserRequestTimes[message.author.id] = Date.now();

          const allowedRoles = settingsManager.settings.allowedRoleIds || [];
          if (allowedRoles.length > 0) {
            const memberRoles = message.member?.roles.cache;
            const hasRole = allowedRoles.some((id) => memberRoles?.has(id));
            if (!hasRole) {
              logger.warn({ author: message.author.username, allowedRoles }, "Blocked: no allowed role");
              logManager.addLog({
                author: message.author.username,
                text: message.content,
                type: "image",
                mediaUrl: "",
                status: "blocked",
                reason: "No allowed role",
              });
              return;
            }
          }

          addJob(`discord-msg-${message.id}`, async () => {
            try {
              let resolvedType: "image" | "video" | "iframe" | "link" = "image";
              let mediaUrl = "";
              let mediaTitle: string | undefined;
              let mediaDuration: number | undefined;
              let mediaProvider: string | undefined;
              let mediaYtDlpError: string | undefined;

              const attachment = message.attachments.first();
              if (attachment) {
                const sizeMB = attachment.size / (1024 * 1024);
                if (sizeMB > settingsManager.settings.mediaMaxSizeMB) {
                  logger.warn(
                    { sizeMB, limit: settingsManager.settings.mediaMaxSizeMB },
                    "File size exceeds threshold"
                  );
                  logManager.addLog({
                    author: message.author.username,
                    text: message.content,
                    type: "image",
                    mediaUrl: attachment.url,
                    status: "blocked",
                    reason: `File size limit exceeded (${sizeMB.toFixed(2)}MB > ${settingsManager.settings.mediaMaxSizeMB}MB limit)`,
                  });
                  return;
                }

                const mime = (attachment.contentType || "").toLowerCase();
                const ext = attachment.url.split("?")[0].toLowerCase();
                const isVideo =
                  mime.startsWith("video/") ||
                  ext.endsWith(".mp4") ||
                  ext.endsWith(".webm") ||
                  ext.endsWith(".mov") ||
                  ext.endsWith(".ogg");

                const isImage =
                  mime.startsWith("image/") ||
                  ext.endsWith(".png") ||
                  ext.endsWith(".jpg") ||
                  ext.endsWith(".jpeg") ||
                  ext.endsWith(".gif") ||
                  ext.endsWith(".webp");

                if (!isVideo && isImage) {
                  resolvedType = "image";
                  mediaUrl = attachment.url;
                } else if (isVideo) {
                  resolvedType = "video";
                  mediaUrl = attachment.url;
                } else {
                  logger.warn({ mime }, "Rejected unsupported attachment mimetype");
                  logManager.addLog({
                    author: message.author.username,
                    text: message.content,
                    type: "image",
                    mediaUrl: attachment.url,
                    status: "blocked",
                    reason: `Unsupported media format: ${mime || "unknown file extension"}`,
                  });
                  return;
                }
              } else {
                const urlRegex = /(https?:\/\/[^\s]+?)(?=[.,;:!?)]*(?:\s|$))/gi;
                const matches = message.content.match(urlRegex);
                if (!matches || matches.length === 0) {
                  return;
                }

                const url = matches[0];
                const resolved = await resolveMediaFromLink(url);
                logger.info({ resolved }, "Media resolved from link");
                resolvedType = resolved.type;
                mediaUrl = resolved.mediaUrl;
                mediaProvider = resolved.provider;
                mediaYtDlpError = resolved.ytDlpError;
                mediaTitle = resolved.title;
                if (resolved.duration) {
                  mediaDuration = resolved.duration;
                }
              }

              const textCheck = processBannedWords(message.content);
              if (textCheck.wasBlocked) {
                logger.warn({ author: message.author.username }, "Blocked message due to banned keyword");
                logManager.addLog({
                  author: message.author.username,
                  text: message.content,
                  type: resolvedType,
                  mediaUrl: mediaUrl,
                  status: "blocked",
                  reason: "Blocked by text filtering rules (banned words matches).",
                });
                return;
              }

              let finalText = textCheck.processed;
              const urlRegex = /(https?:\/\/[^\s]+?)(?=[.,;:!?)]*(?:\s|$))/gi;
              const matches = finalText.match(urlRegex) || [];

              if (matches.length > 0 && message.attachments.size === 0) {
                finalText = finalText.replace(matches[0]!, "").trim();
              }

              if (settingsManager.settings.blockLinks) {
                const remainingMatches = finalText.match(urlRegex) || [];
                if (remainingMatches.length > 0) {
                  logger.warn({ author: message.author.username }, "Blocked message due to extra links");
                  logManager.addLog({
                    author: message.author.username,
                    text: message.content,
                    type: resolvedType,
                    mediaUrl: mediaUrl,
                    status: "blocked",
                    reason: "Blocked because blockLinks is enabled and text contains extra URLs.",
                  });
                  return;
                }
              }

              if (settingsManager.settings.blockNSFW) {
                const hasSpoilerAttachment = message.attachments.some((a) => a.spoiler);
                const hasNSFWText = finalText.toLowerCase().includes("nsfw");
                if (hasSpoilerAttachment || hasNSFWText) {
                  logger.warn({ author: message.author.username }, "Blocked message due to NSFW detection");
                  logManager.addLog({
                    author: message.author.username,
                    text: message.content,
                    type: resolvedType,
                    mediaUrl: mediaUrl,
                    status: "blocked",
                    reason: "Automated NSFW filter triggered (Spoilers/tags found).",
                  });
                  return;
                }
              }

              const alertId = crypto.randomUUID();
              const alertPayload = {
                id: alertId,
                authorName: message.member?.displayName || message.author.globalName || message.author.username,
                authorAvatar:
                  message.author.displayAvatarURL({ forceStatic: false }) ||
                  "https://cdn.discordapp.com/embed/avatars/0.png",
                text: finalText,
                mediaUrl: mediaUrl,
                type: resolvedType,
                title: mediaTitle,
                provider: mediaProvider,
                ytDlpError: mediaYtDlpError,
                duration: mediaDuration || settingsManager.settings.alertDuration,
                syncDurationWithMedia: settingsManager.settings.syncDurationWithMedia,
                neonColor: settingsManager.settings.neonColor,
                alertStyle: settingsManager.settings.alertStyle,
                stopAlertShortcut: settingsManager.settings.stopAlertShortcut || "Escape",
                alertSoundUrl: settingsManager.settings.alertSoundUrl || "",
                timestamp: Date.now(),
              };

              logManager.addLog({
                author: alertPayload.authorName,
                text: alertPayload.text,
                type: alertPayload.type,
                mediaUrl: alertPayload.mediaUrl,
                status: textCheck.wasCensored ? "censored" : "approved",
                reason: alertPayload.ytDlpError
                  ? `Fallback to iframe due to yt-dlp Error: ${alertPayload.ytDlpError.substring(0, 100).replace(/\n/g, " ")}`
                  : textCheck.wasCensored
                    ? "Contenu censuré par filtre de mots"
                    : "Approuvé par filtre de mots",
              });

              alertManager.addAlert(alertPayload);

              if (this.io) {
                this.io.emit("new_alert", alertPayload);
                logger.info({ author: alertPayload.authorName }, "New Alert broadcasted");
              } else {
                logger.error("Alerts socket not initialized");
              }
            } catch (jobErr) {
              logger.error({ err: jobErr }, "Exception inside media job queue");
            }
            return null;
          });
        } catch (msgErr) {
          logger.error({ err: msgErr }, "Exception inside messageCreate handler");
        }
      });

      await this.client.login(token);
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.error({ err }, "Discord Client connection initial failure");
        this.status = "error";
        this.errorMsg = err.message || "Failed client connection login.";
      } else {
        logger.error({ err }, "Discord unknown error");
        this.status = "error";
        this.errorMsg = "Unknown error occurred";
      }
      this.botUser = "";
    }
  }

  private async registerSlashCommands(clientId: string, token: string, channelId: string) {
    try {
      const channel = await this.client?.channels.fetch(channelId);
      if (!channel || channel.isDMBased()) {
        logger.warn({ channelId }, "Cannot register slash commands: channel not found or not guild-based");
        return;
      }

      const guildChannel = channel as import("discord.js").GuildChannel;
      this.guildId = guildChannel.guild.id;

      const commands = [
        new SlashCommandBuilder().setName("skip").setDescription("Skip the currently playing alert").toJSON(),
        new SlashCommandBuilder().setName("queue").setDescription("Show the current alert queue").toJSON(),
      ];

      const rest = new REST({ version: "10" }).setToken(token);
      await rest.put(Routes.applicationGuildCommands(clientId, this.guildId), { body: commands });
      logger.info({ guildId: this.guildId }, "Slash commands registered");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands — bot still works for messages");
    }
  }

  public async shutdown() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        logger.error({ err }, "Failed destroying old discord ws connection");
      }
      this.client = null;
    }
    this.status = "disconnected";
    this.botUser = "";
    this.guildId = "";
  }
}

export const botManager = new DiscordBotManager();
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && npx tsc --noEmit 2>&1 | grep "discordBotManager"
```

Expected: No output (zero errors in that file).

- [ ] **Step 3: Full type-check to catch regressions**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && npx tsc --noEmit 2>&1
```

Expected: Zero errors total.

- [ ] **Step 4: Commit**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && git add server/discordBotManager.ts && git commit -m "feat(discord): add /skip and /queue slash commands with guild-scoped registration"
```

---

### Task 4: Manual verification

No automated tests exist (acknowledged in `CLAUDE.md`). Verify manually:

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/home/Downloads/discord-obs-overlay(3)" && npm run dev
```

Expected: Server starts on port 3000, no startup errors.

- [ ] **Step 2: Verify dock loads queue correctly**

Open `http://localhost:3000/dock` in browser. Open `http://localhost:3000` (dashboard) in another tab. Click "Test Alert" several times to queue up 3+ alerts. Switch to dock tab — queue should show items immediately (not empty). Previously this was broken.

- [ ] **Step 3: Verify drag-and-drop**

In the dock, drag grip handle of an item to reorder it. Items should reorder smoothly. Verify the overlay at `http://localhost:3000/overlay` reflects the new order (it receives `force_queue_update` via socket).

- [ ] **Step 4: Verify dock reconnect**

With dock open, restart the dev server (`Ctrl+C`, `npm run dev`). Dock should reconnect automatically within ~5s and show the current queue. Previously the dock would stay blank after restart.

- [ ] **Step 5: Verify Discord slash commands (requires live bot)**

In your Discord server, type `/skip` as a non-mod user — should reply "❌ You need Manage Messages permission...". Type `/skip` as admin/mod — should reply "⏭️ Alert skipped." and skip the current overlay alert. Type `/queue` as any user — should reply with an embed listing current queue items (or "📭 Queue is empty.").

Check server logs to confirm slash command registration succeeded: look for `"Slash commands registered"` log line on bot connect.
