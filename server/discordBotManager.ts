import { Client, GatewayIntentBits, Message } from "discord.js";
import { Server as SocketServer } from "socket.io";
import { settingsManager } from "./settingsManager.js";
import { logManager } from "./logManager.js";
import { processBannedWords } from "./bannedWords.js";
import { resolveMediaFromLink } from "./mediaParser.js";
import { alertManager } from "./alertManager.js";

class AsyncQueue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;

  async add(task: () => Promise<void>) {
    this.queue.push(task);
    if (!this.processing) {
      this.processing = true;
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) {
          try {
            await next();
          } catch (err) {
            console.error("[AsyncQueue] Task error:", err);
          }
        }
      }
      this.processing = false;
    }
  }
}
const mediaJobQueue = new AsyncQueue();

export class DiscordBotManager {
  private client: Client | null = null;
  private io: SocketServer | null = null;
  public status: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  public errorMsg: string = "";
  public botUser: string = "";
  private lastUserRequestTimes: Record<string, number> = {};

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
    console.log(`[Discord] Starting Discord Client login on channel: ${channelId}...`);

    try {
      this.client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      });

      this.client.once("clientReady", () => {
        this.status = "connected";
        this.botUser = this.client?.user?.tag || "Unknown Bot";
        this.errorMsg = "";
        console.log(`[Discord] Connected as ${this.botUser}`);
      });

      this.client.on("error", (err: Error) => {
        console.error("[Discord] WebSocket exception:", err);
        this.status = "error";
        this.errorMsg = err.message || "Discord WebSocket exception";
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
              console.warn(`[Discord] Blocked message from ${message.author.username} due to cooldown.`);
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

          mediaJobQueue.add(async () => {
            try {
              let resolvedType: "image" | "video" | "iframe" | "link" = "image";
              let mediaUrl = "";
              let mediaDuration: number | undefined;
              let mediaProvider: string | undefined;
              let mediaYtDlpError: string | undefined;

              const attachment = message.attachments.first();
              if (attachment) {
                const sizeMB = attachment.size / (1024 * 1024);
                if (sizeMB > settingsManager.settings.mediaMaxSizeMB) {
                  console.warn(
                    `[Discord] File size ${sizeMB.toFixed(2)}MB exceeds settings threshold: ${settingsManager.settings.mediaMaxSizeMB}MB`
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
                  console.warn(`[Discord] Rejected unsupported attachment mimetype: ${mime}`);
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
                // Strip trailing punctuation that Discord includes in message text but isn't part of the URL
                const urlRegex = /(https?:\/\/[^\s]+?)(?=[.,;:!?)]*(?:\s|$))/gi;
                const matches = message.content.match(urlRegex);
                if (!matches || matches.length === 0) {
                  return;
                }

                const url = matches[0];
                const resolved = await resolveMediaFromLink(url);
                resolvedType = resolved.type;
                mediaUrl = resolved.mediaUrl;
                mediaProvider = resolved.provider;
                mediaYtDlpError = resolved.ytDlpError;
                if (resolved.duration) {
                  mediaDuration = resolved.duration;
                }
              }

              const textCheck = processBannedWords(message.content);
              if (textCheck.wasBlocked) {
                console.warn(`[Discord] Blocked message from ${message.author.username} due to banned keyword`);
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
              const urlRegex = /(https?:\/\/[^\s]+)/gi;
              const matches = finalText.match(urlRegex) || [];

              // Strip the primary media link if there is no attachment (meaning the link IS the media)
              if (matches.length > 0 && message.attachments.size === 0) {
                // We assume the first link matched was used for media extraction
                finalText = finalText.replace(matches[0], "").trim();
              }

              if (settingsManager.settings.blockLinks) {
                // Check remaining links after primary is stripped
                const remainingMatches = finalText.match(urlRegex) || [];

                if (remainingMatches.length > 0) {
                  console.warn(
                    `[Discord] Blocked message from ${message.author.username} due to containing extra links`
                  );
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
                // Very rudimentary check for Discord's spoiler/nsfw flag or common text signals.
                const hasSpoilerAttachment = message.attachments.some((a) => a.spoiler);
                const hasNSFWText = finalText.toLowerCase().includes("nsfw");

                if (hasSpoilerAttachment || hasNSFWText) {
                  console.warn(`[Discord] Blocked message from ${message.author.username} due to NSFW detection`);
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
                provider: mediaProvider,
                ytDlpError: mediaYtDlpError,
                duration: mediaDuration || settingsManager.settings.alertDuration,
                syncDurationWithMedia: settingsManager.settings.syncDurationWithMedia,
                neonColor: settingsManager.settings.neonColor,
                alertStyle: settingsManager.settings.alertStyle,
                stopAlertShortcut: settingsManager.settings.stopAlertShortcut || "Escape",
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
                console.log(`[Alerts] New Alert broadcasted for streamer overlay! Author: ${alertPayload.authorName}`);
              } else {
                console.error("[Alerts] Socket not initialized");
              }
            } catch (jobErr) {
              console.error("[Discord] Exception inside media job queue:", jobErr);
            }
          });
        } catch (msgErr) {
          console.error("[Discord] Exception inside messageCreate handler:", msgErr);
        }
      });

      await this.client.login(token);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("[Discord] Client connection initial failure:", err);
        this.status = "error";
        this.errorMsg = err.message || "Failed client connection login.";
      } else {
        console.error("[Discord] Unknown error:", err);
        this.status = "error";
        this.errorMsg = "Unknown error occurred";
      }
      this.botUser = "";
    }
  }

  public async shutdown() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        console.error("[Discord] Failed destroying old discord ws connection:", err);
      }
      this.client = null;
    }
    this.status = "disconnected";
    this.botUser = "";
  }
}

export const botManager = new DiscordBotManager();
