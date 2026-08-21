import { settingsManager } from "./settingsManager.js";

function formatRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

export function isUserBanned(userId: string): { banned: boolean; remaining?: string } {
  const entry = settingsManager.settings.bannedUsers?.[userId];
  if (!entry) return { banned: false };

  if (entry.until <= Date.now()) {
    unbanUser(userId);
    return { banned: false };
  }

  return { banned: true, remaining: formatRemaining(entry.until - Date.now()) };
}

export function banUser(userId: string, username: string, durationMinutes: number): void {
  const bannedUsers = { ...(settingsManager.settings.bannedUsers ?? {}) };
  bannedUsers[userId] = { until: Date.now() + durationMinutes * 60_000, username };
  settingsManager.settings.bannedUsers = bannedUsers;
  settingsManager.saveSettings(settingsManager.settings);
}

export function unbanUser(userId: string): void {
  const bannedUsers = { ...(settingsManager.settings.bannedUsers ?? {}) };
  delete bannedUsers[userId];
  settingsManager.settings.bannedUsers = bannedUsers;
  settingsManager.saveSettings(settingsManager.settings);
}

export function getBannedUsers(): { userId: string; username: string; until: number }[] {
  const bannedUsers = settingsManager.settings.bannedUsers ?? {};
  const now = Date.now();
  const active: { userId: string; username: string; until: number }[] = [];
  const expired: string[] = [];

  for (const [userId, entry] of Object.entries(bannedUsers)) {
    if (entry.until <= now) {
      expired.push(userId);
    } else {
      active.push({ userId, username: entry.username, until: entry.until });
    }
  }

  if (expired.length > 0) {
    const remaining = { ...bannedUsers };
    for (const userId of expired) delete remaining[userId];
    settingsManager.settings.bannedUsers = remaining;
    settingsManager.saveSettings(settingsManager.settings);
  }

  return active.sort((a, b) => a.until - b.until);
}
