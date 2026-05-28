import { settingsManager } from "./settingsManager.js";

export function processBannedWords(text: string): { processed: string; wasCensored: boolean; wasBlocked: boolean } {
  let processed = text || "";
  let wasCensored = false;
  let wasBlocked = false;

  for (const word of settingsManager.settings.bannedWords) {
    if (!word || !word.trim()) continue;
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    // \b word boundaries prevent substring matches: "ass" won't hit "class" or "pass"
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");

    // Replace first, then check if anything changed — avoids the lastIndex
    // bug that occurs when mixing .test() and .replace() on the same g-flag object.
    const replaced = processed.replace(regex, (match) => "*".repeat(match.length));
    if (replaced !== processed) {
      if (settingsManager.settings.bannedWordsAction === "block") {
        wasBlocked = true;
        break;
      }
      processed = replaced;
      wasCensored = true;
    }
  }

  return { processed, wasCensored, wasBlocked };
}
