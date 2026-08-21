export type AlertFont = "sans" | "mono" | "serif" | "display" | "rounded";
export type AlertPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type AlertAnimation = "slide-up" | "fade" | "zoom" | "bounce";

export interface UIConfig {
  discordToken: string;
  channelId: string;
  alertDuration: number;
  syncDurationWithMedia: boolean;
  bannedWords: string[];
  mediaMaxSizeMB: number;
  neonColor: string;
  alertStyle: "neon" | "glitch" | "cyberpunk" | "glass";
  bannedWordsAction: "block" | "censor";
  stopAlertShortcut: string;
  youtubeCookiesContent?: string;
  cooldownSeconds?: number;
  blockLinks?: boolean;
  blockNSFW?: boolean;
  language?: "fr" | "en" | "uwu-fr" | "uwu-en";
  alertSoundUrl?: string;
  allowedRoleIds?: string[];
  alertFont?: AlertFont;
  alertPosition?: AlertPosition;
  alertScale?: number;
  alertBgOpacity?: number;
  alertAnimation?: AlertAnimation;
  cobaltApiUrl?: string;
  cobaltApiKey?: string;
  mediaQuality?: "720" | "1080" | "1440" | "2160";
  mediaPersistentPlaysThreshold?: number;
}

/** Canonical media type — shared by alerts and logs. "react-player" is not used. */
export type MediaType = "image" | "video" | "audio" | "iframe" | "link";

export interface AlertPayload {
  id: string;
  authorName: string;
  authorAvatar: string;
  /** Discord user snowflake, used to target moderation actions (e.g. temp-ban). */
  authorId?: string;
  text: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  type: MediaType;
  title?: string;
  provider?: string;
  /** Set when yt-dlp failed and the alert fell back to an iframe embed. */
  ytDlpError?: string;
  duration: number;
  syncDurationWithMedia?: boolean;
  neonColor: string;
  alertStyle: "neon" | "glitch" | "cyberpunk" | "glass";
  stopAlertShortcut?: string;
  alertSoundUrl?: string;
  timestamp: number;
  isTest?: boolean;
  alertFont?: AlertFont;
  alertPosition?: AlertPosition;
  alertScale?: number;
  alertBgOpacity?: number;
  alertAnimation?: AlertAnimation;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  author: string;
  authorAvatar?: string;
  /** Discord user snowflake, used to target moderation actions (e.g. temp-ban). */
  authorId?: string;
  text: string;
  title?: string;
  thumbnailUrl?: string;
  type: MediaType;
  mediaUrl: string;
  status: "approved" | "blocked" | "censored" | "error";
  reason: string;
}

/** App-level temp-ban entry (blocks future alerts, not a real Discord action). */
export interface BannedUser {
  userId: string;
  username: string;
  until: number;
}

export interface ServerLogEntry {
  id: string;
  timestamp: number;
  level: "warn" | "error" | "fatal";
  msg: string;
  data?: Record<string, unknown>;
}

export interface Sparkle {
  id: number;
  dx: string;
  dy: string;
  size: string;
  delay: string;
  dur: string;
  bg: string;
}

export interface BotStatus {
  status: "connected" | "connecting" | "disconnected" | "error";
  botUser: string;
  errorMsg: string;
  overlayPaused?: boolean;
  health?: {
    cache: {
      size: number;
      files: number;
    };
    system: {
      cpu: number;
      memory: {
        used: number;
        total: number;
      };
    };
    ytdlp: string;
  };
}
