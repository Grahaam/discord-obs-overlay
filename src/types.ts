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
}

/** Canonical media type — shared by alerts and logs. "react-player" is not used. */
export type MediaType = "image" | "video" | "iframe" | "link";

export interface AlertPayload {
  id: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  mediaUrl: string;
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
}

export interface LogEntry {
  id: string;
  timestamp: number;
  author: string;
  text: string;
  type: MediaType;
  mediaUrl: string;
  status: "approved" | "blocked" | "censored" | "error";
  reason: string;
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
