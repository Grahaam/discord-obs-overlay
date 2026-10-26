import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { UIConfig } from "../types";
import { isSavable } from "./settingsValidation";

export const DEFAULT_CONFIG: UIConfig = {
  discordToken: "",
  channelId: "",
  alertDuration: 8000,
  syncDurationWithMedia: true,
  mediaMaxSizeMB: 50,
  bannedWords: [],
  neonColor: "#6366f1",
  alertStyle: "neon",
  bannedWordsAction: "censor",
  stopAlertShortcut: "Escape",
  youtubeCookiesContent: "",
  cooldownSeconds: 1,
  blockLinks: false,
  blockNSFW: false,
  language: "fr",
  cobaltApiUrl: "",
  cobaltApiKey: "",
  mediaQuality: "1080",
};

export type SaveState = "idle" | "saving" | "saved" | "error";
export type SecretPatch = Partial<Pick<UIConfig, "discordToken" | "obsWebsocketPassword">>;

export interface SettingsNotifier {
  saved: () => void;
  secretSaved: () => void;
  failed: (message: string) => void;
}

const DEBOUNCE_MS = 600;

/**
 * Settings state with autosave: every edit through `setConfig` is posted to /api/settings after a short
 * pause. Secrets (Discord token, OBS password) never travel through it: the server returns them masked,
 * and the mask means "keep the stored value", so they are only changed by `applySecrets`.
 */
export function useSettings(notify: React.RefObject<SettingsNotifier | null>) {
  const [config, setConfigState] = useState<UIConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const configRef = useRef(config);
  const loadedRef = useRef(false);
  const editVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const adopt = useCallback((next: UIConfig) => {
    configRef.current = next;
    setConfigState(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      adopt(await res.json());
      loadedRef.current = true;
      setLoaded(true);
    } catch (err) {
      console.error("Dashboard failed pulling settings:", err);
    }
  }, [adopt]);

  const post = useCallback(
    (body: UIConfig, kind: "auto" | "secret") => {
      const version = editVersion.current;
      chain.current = chain.current.then(async () => {
        setSaveState("saving");
        try {
          const res = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`);
          }
          const data = await res.json();
          // Keep what the user typed since this request left; the next save carries it
          if (data.success && editVersion.current === version) adopt(data.settings);
          setSaveState("saved");
          if (kind === "secret") notify.current?.secretSaved();
          else notify.current?.saved();
        } catch (err) {
          console.error("Failed saving settings:", err);
          setSaveState("error");
          notify.current?.failed(err instanceof Error ? err.message : String(err));
        }
      });
      return chain.current;
    },
    [adopt, notify]
  );

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const body = configRef.current;
    // Out-of-range value mid-edit: wait for the next edit instead of raising a validation error
    if (!loadedRef.current || !isSavable(body)) return Promise.resolve();
    return post(body, "auto");
  }, [post]);

  /** Same contract as a React state setter; the change is saved after a short pause. */
  const setConfig: Dispatch<SetStateAction<UIConfig>> = useCallback(
    (action) => {
      const next = typeof action === "function" ? action(configRef.current) : action;
      configRef.current = next;
      setConfigState(next);
      if (!loadedRef.current) return;
      editVersion.current++;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush]
  );

  /** Immediate save (no debounce) of a config the caller already built. */
  const saveNow = useCallback(
    (next: UIConfig) => {
      configRef.current = next;
      setConfigState(next);
      editVersion.current++;
      return flush();
    },
    [flush]
  );

  const applySecrets = useCallback(
    (patch: SecretPatch) => {
      clearTimeout(timer.current);
      timer.current = undefined;
      editVersion.current++;
      return post({ ...configRef.current, ...patch }, "secret");
    },
    [post]
  );

  useEffect(() => {
    void load();
    // Do not lose an edit made in the last moments before leaving the page
    const onHide = () => {
      if (timer.current) void flush();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, [load, flush]);

  return { config, setConfig, saveNow, applySecrets, saveState, loaded, reload: load };
}
