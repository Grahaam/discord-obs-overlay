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
export type BodyPart = "arms" | "legs" | "head" | "leftHand" | "rightHand";
export type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";
export type FingerState = "up" | "down" | "any";
export interface HandTemplate {
  fingers: Record<Finger, FingerState>;
  /** 0–1, as recorded (shown on the card) */
  curls: Record<Finger, number>;
  /** hand centre (mean of 0, 5, 9, 13, 17), shoulder-normalised */
  position: { x: number; y: number };
  /** radians: wrist→middle knuckle (0→9), thumb base→tip (2→4), aspect-corrected */
  direction: { palm: number; thumb: number };
}

export interface NormalizedPoint {
  x: number;
  y: number;
  visibility: number;
}

export interface PoseMedia {
  type: "image" | "video";
  imageUrl?: string;
  soundUrl?: string;
  videoUrl?: string;
  volume: number;
  durationSeconds?: number;
  maxDurationSeconds: number;
  fullscreen: boolean;
}

export interface PoseAlertPayload {
  poseId: string;
  media: PoseMedia;
}

export interface Pose {
  id: string;
  name: string;
  kind: "custom" | "builtin";
  builtinId?: "absolute-cinema";
  enabled: boolean;
  template?: NormalizedPoint[];
  bodyParts: BodyPart[];
  threshold: number;
  mirror: boolean;
  holdMs: number;
  cooldownSeconds: number;
  media: PoseMedia;
  /** gap = right centre − left centre, in shoulder units */
  hands?: { left?: HandTemplate; right?: HandTemplate; gap?: { x: number; y: number } };
  /** undefined means true */
  handPosition?: boolean;
  /** undefined means true */
  handDirection?: boolean;
}

export interface PosesFile {
  version: 1;
  poses: Pose[];
  hiddenBuiltins: string[];
}

export interface UIConfig {
  discordToken: string;
  obsWebsocketPort?: number;
  obsWebsocketPassword?: string;
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
  poseDetectionEnabled?: boolean;
  poseCameraSource?: string;
  poseCooldownSeconds?: number;
  poseAlertImageUrl?: string;
  poseAlertSoundUrl?: string;
}

/** Canonical media type — shared by alerts and logs. "react-player" is not used. */
export type MediaType = "image" | "video" | "audio" | "iframe" | "link";

export interface AlertPayload {
  id: string;
  authorName: string;
  authorAvatar: string;
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
  text: string;
  title?: string;
  thumbnailUrl?: string;
  type: MediaType;
  mediaUrl: string;
  status: "approved" | "blocked" | "censored" | "error";
  reason: string;
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

/** Why the bot can't read the configured channel (see server/channelCheck.ts). */
export interface ChannelIssue {
  /** not_found: no server the bot is in has this channel. no_access: found, but permissions block it. */
  kind: "not_found" | "no_access";
  channelId: string;
  channelName?: string;
  guildName?: string;
  botRole?: string;
  /** Missing permission names, e.g. ["ViewChannel"]. */
  missing: string[];
  inviteUrl: string;
}

/** One server of GET /api/discord/channels, with the text channels the bot can see in it. */
export interface DiscordGuildInfo {
  id: string;
  name: string;
  channels: { id: string; name: string; readable: boolean; missing: string[] }[];
}

export interface BotStatus {
  status: "connected" | "connecting" | "disconnected" | "error";
  botUser: string;
  errorMsg: string;
  channelIssue?: ChannelIssue | null;
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
