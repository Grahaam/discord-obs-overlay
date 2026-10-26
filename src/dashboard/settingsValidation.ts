import type { UIConfig } from "../types";

const inRange = (value: number | undefined, min: number, max = Infinity) =>
  value === undefined || (Number.isFinite(value) && value >= min && value <= max);

/**
 * Mirrors the numeric bounds of the server's settings schema (server/routes.ts).
 * Autosave skips a save while a field is mid-edit and out of range (typing "8" on the way to "8000"
 * must not raise an error), and sends it once the value becomes valid.
 */
export function isSavable(config: UIConfig): boolean {
  return (
    inRange(config.alertDuration, 500, 60000) &&
    inRange(config.mediaMaxSizeMB, 1, 500) &&
    inRange(config.cooldownSeconds, 1) &&
    inRange(config.obsWebsocketPort, 1, 65535) &&
    inRange(config.alertScale, 0.5, 2) &&
    inRange(config.alertBgOpacity, 0, 1) &&
    inRange(config.poseCooldownSeconds, 5, 3600) &&
    /^#/.test(config.neonColor)
  );
}
