import fs from "fs";
import path from "path";
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

  // Moderation Extras
  cooldownSeconds?: number;
  blockLinks?: boolean;
  blockNSFW?: boolean;
  language: "fr" | "en" | "uwu-fr" | "uwu-en";
}

export const defaultSettings: Settings = {
  discordToken: "",
  channelId: "",
  alertDuration: 8000,
  syncDurationWithMedia: true,
  bannedWords: ["scam", "spam", "troll", "nsfw", "hacker", "fakebot"],
  mediaMaxSizeMB: 8,
  neonColor: "#6366f1",
  alertStyle: "neon",
  bannedWordsAction: "censor",
  stopAlertShortcut: "Escape",
  youtubeCookiesContent: "",
  cooldownSeconds: 0,
  blockLinks: false,
  blockNSFW: false,
  language: "fr",
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

      console.log("[Settings] Loaded securely (tokens mapped from env).");

      if (!fs.existsSync(SETTINGS_FILE)) {
        this.saveSettings(this.settings);
      }
    } catch (err) {
      console.error("[Settings] Failed to load settings, using defaults.", err);
    }
  }

  public saveSettings(newSettings: Settings) {
    try {
      // 1. Separate sensitive from public
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { discordToken: _t, youtubeCookiesContent: _c, ...publicSettings } = newSettings;

      // 2. Save public things safely to settings.json
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(publicSettings, null, 2), "utf-8");

      // 3. Save discordToken safely to .env
      this.writeEnvVars({ DISCORD_TOKEN: discordToken });

      this.settings = { ...newSettings };

      console.log("[Settings] Saved successfully (secrets secured).");

      // 4. Sycn Cookies to cookies.txt natively
      this.syncCookiesFile();
    } catch (err) {
      console.error("[Settings] Failed to save settings on disk.", err);
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
      console.error("[Settings] Could not write to .env", e);
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
      console.error("[Settings] Failed to sync cookies.txt.", err);
    }
  }
}

export const settingsManager = new SettingsManager();
