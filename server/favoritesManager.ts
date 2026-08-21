import { logger } from "./logger.js";
import type { LogEntry } from "../src/types.js";
import { persistFavorite, removePersistedFavorite } from "./db.js";

const MAX_FAVORITES = 50;

class FavoritesManager {
  private favorites: LogEntry[] = [];

  /** Favorite is a pinned copy of a LogEntry, keeping its original id so it stays
   *  replayable through the existing /api/replay-alert lookup after the source log
   *  entry has been trimmed or evicted. */
  public addFavorite(log: LogEntry): LogEntry {
    const existing = this.favorites.find((f) => f.id === log.id);
    if (existing) return existing;

    this.favorites.unshift(log);
    persistFavorite(log);

    if (this.favorites.length > MAX_FAVORITES) {
      const evicted = this.favorites.pop();
      if (evicted) removePersistedFavorite(evicted.id);
    }

    return log;
  }

  public removeFavorite(id: string): void {
    this.favorites = this.favorites.filter((f) => f.id !== id);
    removePersistedFavorite(id);
  }

  public getFavorites(): LogEntry[] {
    return [...this.favorites];
  }

  /** Called once on startup to restore favorites from SQLite. */
  public restoreFromDb(favorites: LogEntry[]): void {
    this.favorites = favorites.slice(0, MAX_FAVORITES);
    logger.info({ count: this.favorites.length }, "Restored favorite(s) from DB");
  }
}

export const favoritesManager = new FavoritesManager();
