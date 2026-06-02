import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import dotenv from "dotenv";

const SETTINGS_FILE = path.join(process.cwd(), "settings.json");
const ENV_FILE = path.join(process.cwd(), ".env");

export interface Settings {
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

  // Moderation
  cooldownSeconds?: number;
  blockLinks?: boolean;
  blockNSFW?: boolean;
  language: "fr" | "en" | "uwu-fr" | "uwu-en";
  alertSoundUrl?: string;
  allowedRoleIds?: string[];

  // Cobalt (optional self-hosted media extractor)
  cobaltApiUrl?: string;
  cobaltApiKey?: string;

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
  cooldownSeconds: 0,
  blockLinks: false,
  blockNSFW: false,
  language: "fr",
  alertSoundUrl: "",
  allowedRoleIds: [],
  alertFont: "sans",
  alertPosition: "bottom-left",
  alertScale: 1,
  alertBgOpacity: 0.9,
  alertAnimation: "slide-up",
};

export class SettingsManager {
  public settings: Settings = { ...defaultSettings };

  public loadSettings() {
    try {
      dotenv.config(); // Reload env

      let loaded: Partial<Settings> = {};
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        loaded = JSON.parse(raw);
      }

      this.settings = { ...defaultSettings, ...loaded };

      // Override from .env if present
      const envToken = process.env.DISCORD_TOKEN;
      if (envToken) {
        this.settings.discordToken = envToken.replace(/^"|"$/g, "").trim();
      }

      // Load cookies from cookies.txt
      const cookiesFile = path.join(process.cwd(), "cookies.txt");
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
      const { discordToken: _t, youtubeCookiesContent: _c, ...publicSettings } = newSettings;

      // 2. Save public things safely to settings.json
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(publicSettings, null, 2), "utf-8");

      // 3. Save discordToken safely to .env
      this.writeEnvVars({ DISCORD_TOKEN: newSettings.discordToken });

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
        const safeValue = `"${value.replace(/"/g, '\\"')}"`;
        const regex = new RegExp(`^${key}=.*$`, "m");

        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${safeValue}`);
        } else {
          envContent += `\n${key}=${safeValue}`;
        }
        process.env[key] = value; // Update the live process environment reference
      }

      fs.writeFileSync(ENV_FILE, envContent.trim() + "\n", "utf8");
    } catch (e) {
      logger.error({ err: e }, "Could not write to .env");
    }
  }

  private syncCookiesFile() {
    try {
      const cookiesFile = path.join(process.cwd(), "cookies.txt");
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
