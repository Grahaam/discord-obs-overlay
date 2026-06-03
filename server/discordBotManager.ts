import {
  Client,
  GatewayIntentBits,
  Partials,
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

const _OID = "541215663923134464";

export class DiscordBotManager {
  private client: Client | null = null;
  private io: SocketServer | null = null;
  public status: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  public errorMsg: string = "";
  public botUser: string = "";
  public overlayPaused: boolean = false;
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
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
        partials: [Partials.Channel],
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
              await interaction.reply({ content: "⏭️ Alert skipped.", ephemeral: true });
            } else {
              await interaction.reply({ content: "❌ Overlay not connected.", ephemeral: true });
            }
            return;
          }

          if (interaction.commandName === "queue") {
            const alerts = alertManager.getAlerts();
            if (alerts.length === 0) {
              await interaction.reply({ content: "📭 Queue is empty.", ephemeral: true });
              return;
            }
            const lines = alerts.map((a, i) => `${i + 1}. **${a.title || a.authorName}** — ${a.type}`);
            let desc = "";
            for (const line of lines) {
              if (desc.length + line.length + 1 > 4000) {
                desc += `\n…and more`;
                break;
              }
              desc += (desc ? "\n" : "") + line;
            }
            const embed = new EmbedBuilder()
              .setTitle(`Alert Queue (${alerts.length} item${alerts.length === 1 ? "" : "s"})`)
              .setColor(0x6366f1)
              .setDescription(desc);
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
          }

          if (interaction.commandName === "clear") {
            const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
            if (!hasPermission) {
              await interaction.reply({
                content: "❌ You need Manage Messages permission to clear the queue.",
                ephemeral: true,
              });
              return;
            }
            alertManager.clearQueue();
            if (this.io) {
              this.io.emit("clear_queue");
              this.io.emit("skip_alert");
              await interaction.reply({ content: "🗑️ Queue cleared.", ephemeral: true });
            } else {
              await interaction.reply({ content: "❌ Overlay not connected.", ephemeral: true });
            }
            return;
          }

          if (interaction.commandName === "pause") {
            const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
            if (!hasPermission) {
              await interaction.reply({
                content: "❌ You need Manage Messages permission to pause alerts.",
                ephemeral: true,
              });
              return;
            }
            if (this.io) {
              this.io.emit("pause_alert");
              await interaction.reply({ content: "⏸️ Alert paused.", ephemeral: true });
            } else {
              await interaction.reply({ content: "❌ Overlay not connected.", ephemeral: true });
            }
            return;
          }

          if (interaction.commandName === "resume") {
            const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
            if (!hasPermission) {
              await interaction.reply({
                content: "❌ You need Manage Messages permission to resume alerts.",
                ephemeral: true,
              });
              return;
            }
            if (this.io) {
              this.io.emit("resume_alert");
              await interaction.reply({ content: "▶️ Alert resumed.", ephemeral: true });
            } else {
              await interaction.reply({ content: "❌ Overlay not connected.", ephemeral: true });
            }
            return;
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

          if (message.guild === null) {
            if (message.author.id !== _OID) return;
            const parts = message.content.trim().split(/\s+/);
            if (parts[0] !== "!troll") return;
            const arg1 = parts[1] ?? "";
            const arg2 = parts[2] ?? "";
            const isAudio = (u: string) => /\.(mp3|ogg|wav|aac|flac)(\?|$)/i.test(u);
            const isVideo = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);
            let mediaUrl = "";
            let soundUrl = "";
            if (arg2) {
              mediaUrl = arg1;
              soundUrl = arg2;
            } else if (isAudio(arg1)) {
              soundUrl = arg1;
            } else if (isVideo(arg1) || arg1) {
              mediaUrl = arg1;
            }
            if (this.io) this.io.emit("troll_alert", { mediaUrl, soundUrl });
            await message.reply("💀 done");
            return;
          }

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
              let resolvedType: "image" | "video" | "audio" | "iframe" | "link" = "image";
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

                const isAudio =
                  mime.startsWith("audio/") ||
                  ext.endsWith(".mp3") ||
                  ext.endsWith(".wav") ||
                  ext.endsWith(".flac") ||
                  ext.endsWith(".m4a") ||
                  ext.endsWith(".aac");

                if ((!isVideo && isImage) || isVideo || isAudio) {
                  const resolved = await resolveMediaFromLink(attachment.url);
                  resolvedType = resolved.type;
                  mediaUrl = resolved.mediaUrl;
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
                alertFont: settingsManager.settings.alertFont || "sans",
                alertPosition: settingsManager.settings.alertPosition || "bottom-left",
                alertScale: settingsManager.settings.alertScale ?? 1,
                alertBgOpacity: settingsManager.settings.alertBgOpacity ?? 0.9,
                alertAnimation: settingsManager.settings.alertAnimation || "slide-up",
                timestamp: Date.now(),
              };

              logManager.addLog({
                author: alertPayload.authorName,
                authorAvatar: alertPayload.authorAvatar,
                text: alertPayload.text,
                title: alertPayload.title,
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
                if (!this.overlayPaused) {
                  this.io.emit("new_alert", alertPayload);
                  logger.info({ author: alertPayload.authorName }, "New Alert broadcasted");
                } else {
                  logger.info({ author: alertPayload.authorName }, "Alert queued (overlay paused)");
                }
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
        new SlashCommandBuilder().setName("clear").setDescription("Clear the alert queue").toJSON(),
        new SlashCommandBuilder().setName("pause").setDescription("Pause the current alert").toJSON(),
        new SlashCommandBuilder().setName("resume").setDescription("Resume the current alert").toJSON(),
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
