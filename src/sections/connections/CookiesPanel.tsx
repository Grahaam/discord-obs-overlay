import { useMemo } from "react";
import { Field, StatusPill, cx, inputClass } from "../../ui";
import { useDashboard } from "../../dashboard/DashboardContext";

const PLATFORM_DOMAINS: Record<string, string> = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "x.com": "X/Twitter",
  "twitter.com": "X/Twitter",
  "instagram.com": "Instagram",
  "tiktok.com": "TikTok",
  "twitch.tv": "Twitch",
  "reddit.com": "Reddit",
  "facebook.com": "Facebook",
};

const RELEVANT_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "google.com",
  "googleapis.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "t.co",
  "twitch.tv",
  "clips.twitch.tv",
  "reddit.com",
  "redd.it",
  "facebook.com",
  "fb.com",
  "vimeo.com",
  "dailymotion.com",
  "streamable.com",
  "kick.com",
  "bilibili.com",
  "nicovideo.jp",
  "soundcloud.com",
  "bandcamp.com",
  "rumble.com",
  "odysee.com",
  "pinterest.com",
  "tumblr.com",
];

type CookieStatus = "ok" | "expired" | "session";

/** Netscape cookies.txt editor (Instagram / TikTok / Reddit), with a per-platform validity summary. */
export default function CookiesPanel() {
  const { t, config, setConfig } = useDashboard();
  const content = config.youtubeCookiesContent || "";

  const cookieDomainStatus = useMemo(() => {
    if (!content) return [];
    // eslint-disable-next-line react-hooks/purity
    const now = Math.floor(Date.now() / 1000);
    const platformStatus: Record<string, CookieStatus> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 6) continue;
      const domain = parts[0].replace(/^\./, "");
      const expiry = parseInt(parts[4], 10);
      const platform = Object.entries(PLATFORM_DOMAINS).find(([d]) => domain.endsWith(d))?.[1];
      if (!platform) continue;
      if (platformStatus[platform] === "ok") continue;
      if (expiry === 0) platformStatus[platform] ??= "session";
      else if (expiry < now) platformStatus[platform] = "expired";
      else platformStatus[platform] = "ok";
    }
    return Object.entries(platformStatus);
  }, [content]);

  const cookieLineCount = content ? content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length : 0;

  const filterOnBlur = (raw: string) => {
    if (!raw) return;
    const filtered = raw
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return true;
        return RELEVANT_DOMAINS.some((d) => trimmed.includes(d));
      })
      .join("\n");
    if (filtered !== raw) setConfig((c) => ({ ...c, youtubeCookiesContent: filtered }));
  };

  const linkClass = "text-accent-text underline hover:text-fg focus-ring rounded";

  return (
    <div id="cookies-section" className="flex flex-col gap-3">
      {cookieLineCount > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label={t.connections.statusLabel}>
          <li>
            <StatusPill tone="neutral">
              {cookieLineCount} cookie{cookieLineCount !== 1 ? "s" : ""} {t.bot.cookiesLoaded}
            </StatusPill>
          </li>
          {cookieDomainStatus.map(([platform, status]) => (
            <li
              key={platform}
              title={
                status === "expired"
                  ? t.connections.cookieExpired
                  : status === "session"
                    ? t.connections.cookieSession
                    : t.connections.cookieValid
              }
            >
              <StatusPill tone={status === "ok" ? "ok" : status === "expired" ? "danger" : "warn"}>
                {platform} {status === "ok" ? "✓" : status === "expired" ? "✗" : "~"}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}

      <Field label={t.connections.cookiesField} hint={t.bot.cookies}>
        {(aria) => (
          <textarea
            {...aria}
            spellCheck={false}
            placeholder={"# Netscape HTTP Cookie File\n..."}
            value={content}
            onChange={(e) => setConfig((c) => ({ ...c, youtubeCookiesContent: e.target.value }))}
            onBlur={(e) => filterOnBlur(e.target.value)}
            className={cx(inputClass, "min-h-32 resize-y font-mono text-xs")}
          />
        )}
      </Field>

      <details className="rounded-control border border-line bg-surface p-3">
        <summary className="cursor-pointer rounded text-sm font-semibold text-fg-muted focus-ring">
          {t.bot.cookiesHowTo}
        </summary>
        <ol className="ml-5 mt-3 flex list-decimal flex-col gap-1.5 text-xs leading-relaxed text-fg-muted">
          <li>{t.bot.cookiesStep1}</li>
          <li>
            {t.bot.cookiesStep2}{" "}
            <a
              href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              Chrome Web Store
            </a>{" "}
            /{" "}
            <a
              href="https://addons.mozilla.org/firefox/addon/get-cookies-txt-locally/"
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              Firefox Add-ons
            </a>
          </li>
          <li>{t.bot.cookiesStep3}</li>
          <li>{t.bot.cookiesStep4}</li>
          <li>{t.bot.cookiesStep5}</li>
        </ol>
      </details>

      <p className="rounded-control border border-warn/30 bg-warn-soft p-3 text-xs leading-relaxed text-warn-text">
        {t.bot.cookiesWarning}
      </p>
    </div>
  );
}
