import fs from "fs";
import { logger } from "./logger.js";
import { DATA_PATHS } from "./paths.js";
import dotenv from "dotenv";
import type { ApprovalMode } from "../src/types.js";
import { readEnvVar, upsertEnvVar } from "./envFile.js";

const SETTINGS_FILE = DATA_PATHS.settingsFile;
const ENV_FILE = DATA_PATHS.envFile;

export interface Settings {
  discordToken: string;
  // obs-websocket connection (password lives in .env like the Discord token)
  obsWebsocketPort: number;
  obsWebsocketPassword: string;
  channelId: string;
  alertDuration: number;
  syncDurationWithMedia: boolean;
  bannedWords: string[];
  mediaMaxSizeMB: number;
  neonColor: string;
  alertStyle: "neon" | "glitch" | "cyberpunk" | "glass";
  bannedWordsAction: "block" | "censor";
  stopAlertShortcut: string;
  // Historic name: used for non-YouTube sites only (Instagram, TikTok, Reddit...); renaming would break stored data
  youtubeCookiesContent?: string;

  // Moderation
  cooldownSeconds?: number;
  blockLinks?: boolean;
  blockNSFW?: boolean;
  language: "fr" | "en" | "uwu-fr" | "uwu-en";
  alertSoundUrl?: string;
  allowedRoleIds?: string[];
  // Approval inbox
  approvalMode: ApprovalMode;
  approvalTrustedRoleIds: string[];
  approvalNewPosterCount: number;
  approvalExpiryMinutes: number;
  approvalReactions: boolean;

  // Cobalt (optional self-hosted media extractor)
  cobaltApiUrl?: string;
  cobaltApiKey?: string;
  mediaQuality?: "720" | "1080" | "1440" | "2160";
  mediaPersistentPlaysThreshold?: number;

  // "Absolute Cinema" pose detection
  poseDetectionEnabled?: boolean;
  poseCameraSource?: string;
  poseCooldownSeconds?: number;
  poseAlertImageUrl?: string;
  poseAlertSoundUrl?: string;

  // Visual customization
  alertFont?: "sans" | "mono" | "serif" | "display" | "rounded";
  alertPosition?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "center-left"
    | "center"
    | "center-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  alertScale?: number;
  alertBgOpacity?: number;
  alertAnimation?: "slide-up" | "fade" | "zoom" | "bounce";
}

export const defaultSettings: Settings = {
  discordToken: "",
  obsWebsocketPort: 4455,
  obsWebsocketPassword: "",
  channelId: "",
  alertDuration: 8000,
  syncDurationWithMedia: true,
  bannedWords: ["scam", "spam", "troll", "nsfw", "hacker", "fakebot"],
  mediaMaxSizeMB: 50,
  neonColor: "#6366f1",
  alertStyle: "neon",
  bannedWordsAction: "censor",
  stopAlertShortcut: "Escape",
  youtubeCookiesContent: "",
  cooldownSeconds: 1,
  blockLinks: false,
  blockNSFW: false,
  language: "fr",
  alertSoundUrl: "",
  allowedRoleIds: [],
  approvalMode: "new",
  approvalTrustedRoleIds: [],
  approvalNewPosterCount: 1,
  approvalExpiryMinutes: 30,
  approvalReactions: true,
  alertFont: "sans",
  alertPosition: "bottom-left",
  alertScale: 1,
  alertBgOpacity: 0.9,
  alertAnimation: "slide-up",
  mediaQuality: "1080",
  mediaPersistentPlaysThreshold: 5,
  poseDetectionEnabled: false,
  poseCameraSource: "",
  poseCooldownSeconds: 30,
  poseAlertImageUrl: "/user-assets/absolute-cinema.jpg",
  poseAlertSoundUrl: "/user-assets/absolute-cinema.mp3",
};

export class SettingsManager {
  public settings: Settings = { ...defaultSettings };

  public loadSettings() {
    try {
      dotenv.config({ path: ENV_FILE }); // Reload env

      let loaded: Partial<Settings> = {};
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        loaded = JSON.parse(raw);
      }

      this.settings = { ...defaultSettings, ...loaded };

      // Override from .env if present
      // Parsed with readEnvVar (inverse of the writer) so quotes/backslashes in a password survive
      const envText = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
      const envToken = readEnvVar(envText, "DISCORD_TOKEN") ?? process.env.DISCORD_TOKEN;
      if (envToken) {
        this.settings.discordToken = envToken.replace(/^"|"$/g, "").trim();
      }

      const envObsPassword = readEnvVar(envText, "OBS_WEBSOCKET_PASSWORD") ?? process.env.OBS_WEBSOCKET_PASSWORD;
      if (envObsPassword) {
        this.settings.obsWebsocketPassword = envObsPassword;
      }

      // Load cookies from cookies.txt
      const cookiesFile = DATA_PATHS.cookiesFile;
      if (fs.existsSync(cookiesFile)) {
        this.settings.youtubeCookiesContent = fs.readFileSync(cookiesFile, "utf-8");
      }

      logger.info("Loaded securely (tokens mapped from env)");

      if (!fs.existsSync(SETTINGS_FILE)) {
        this.saveSettings(this.settings);
      }
    } catch (err) {
      logger.error({ err }, "Failed to load settings, using defaults");
    }
  }

  public saveSettings(newSettings: Settings) {
    try {
      // 1. Separate sensitive from public
      const { discordToken: _t, obsWebsocketPassword: _o, youtubeCookiesContent: _c, ...publicSettings } = newSettings;

      // 2. Save public things safely to settings.json
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(publicSettings, null, 2), "utf-8");

      // 3. Save discordToken safely to .env
      this.writeEnvVars({
        DISCORD_TOKEN: newSettings.discordToken,
        OBS_WEBSOCKET_PASSWORD: newSettings.obsWebsocketPassword ?? "",
      });

      this.settings = { ...newSettings };

      logger.info("Saved successfully (secrets secured)");

      // 4. Sycn Cookies to cookies.txt natively
      this.syncCookiesFile();
    } catch (err) {
      logger.error({ err }, "Failed to save settings on disk");
    }
  }

  private writeEnvVars(vars: Record<string, string>) {
    try {
      let envContent = "";
      if (fs.existsSync(ENV_FILE)) {
        envContent = fs.readFileSync(ENV_FILE, "utf8");
      }

      for (const [key, value] of Object.entries(vars)) {
        envContent = upsertEnvVar(envContent, key, value);
        process.env[key] = value; // Update the live process environment reference
      }

      fs.writeFileSync(ENV_FILE, envContent.trim() + "\n", "utf8");
    } catch (e) {
      logger.error({ err: e }, "Could not write to .env");
    }
  }

  private syncCookiesFile() {
    try {
      const cookiesFile = DATA_PATHS.cookiesFile;
      const content = (this.settings.youtubeCookiesContent || "").trim();

      if (!content) {
        if (fs.existsSync(cookiesFile)) {
          fs.unlinkSync(cookiesFile);
        }
        return;
      }

      let finalContent = content;
      if (!finalContent.includes("# Netscape HTTP Cookie File")) {
        finalContent = "# Netscape HTTP Cookie File\n# This is a generated file! Do not edit.\n\n" + finalContent;
      }

      fs.writeFileSync(cookiesFile, finalContent, "utf-8");
    } catch (err) {
      logger.error({ err }, "Failed to sync cookies.txt");
    }
  }
}

export const settingsManager = new SettingsManager();
