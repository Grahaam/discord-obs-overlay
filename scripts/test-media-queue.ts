#!/usr/bin/env npx tsx
/**
 * Media queue test runner.
 * Sends each URL through /api/trigger-test (full resolve + queue),
 * then skips the alert so the queue never blocks.
 *
 * Usage:
 *   npx tsx scripts/test-media-queue.ts [--base http://localhost:3000] [--timeout 120] [--filter youtube]
 *
 * Options:
 *   --base <url>      Server base URL (default: http://localhost:3000)
 *   --timeout <sec>   Per-URL resolve timeout in seconds (default: 120)
 *   --filter <str>    Only run cases whose platform/description contains this string
 *   --no-skip         Don't auto-skip after each alert (let them play in the overlay)
 *   --delay <ms>      Delay between tests in ms (default: 500)
 */

const BASE_URL = (() => {
  const i = process.argv.indexOf("--base");
  return i !== -1 ? process.argv[i + 1] : "http://localhost:3000";
})();

const TIMEOUT_S = (() => {
  const i = process.argv.indexOf("--timeout");
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 120;
})();

const FILTER = (() => {
  const i = process.argv.indexOf("--filter");
  return i !== -1 ? process.argv[i + 1].toLowerCase() : null;
})();

const AUTO_SKIP = !process.argv.includes("--no-skip");

const DELAY_MS = (() => {
  const i = process.argv.indexOf("--delay");
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 500;
})();

// ─── ANSI colours ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};

// ─── Test cases ──────────────────────────────────────────────────────────────
interface TestCase {
  platform: string;
  description: string;
  url: string;
  expectedType: "image" | "video" | "audio" | "iframe" | "link";
  /** Whether we expect /api/media-cache/ in the returned mediaUrl */
  expectCached: boolean;
  notes?: string;
}

const TESTS: TestCase[] = [
  // ── Direct extension fast path ──────────────────────────────────────────
  {
    platform: "Direct CDN",
    description: "MP4 small (Blender Foundation)",
    // Google Cloud Storage returns 403 to bots; Blender CDN is open
    url: "https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_480p_surround-fix.avi",
    expectedType: "video",
    expectCached: false,
    notes: ".avi extension misses fast path → yt-dlp handles; expectCached false",
  },
  {
    platform: "Direct CDN",
    description: "MP4 direct (W3Schools sample)",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    expectedType: "video",
    expectCached: true,
    notes: "direct-video fast path; User-Agent fix needed for w3schools",
  },
  {
    platform: "Direct CDN",
    description: "JPEG image (Wikimedia, User-Agent required)",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg",
    expectedType: "image",
    expectCached: true,
    notes: "cacheMedia User-Agent fix; previously returned type:video via yt-dlp→ffmpeg corruption",
  },
  {
    platform: "Direct CDN",
    description: "PNG with transparency (Wikimedia)",
    url: "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
    expectedType: "image",
    expectCached: true,
    notes: "full-size URL avoids Wikimedia thumbnail 400 error",
  },
  {
    platform: "Direct CDN",
    description: "Animated GIF (Wikimedia)",
    // Chuck Berry GIF is 404; use a live one
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Rotating_earth_%28large%29.gif/200px-Rotating_earth_%28large%29.gif",
    expectedType: "image",
    expectCached: true,
    notes: "GIF treated as image type",
  },
  {
    platform: "Imgur",
    description: "Direct Imgur CDN image",
    // ZOEzUxT was deleted; use a stable public Imgur image
    url: "https://i.imgur.com/7QT3bGf.jpeg",
    expectedType: "image",
    expectCached: true,
    notes: "tests i.imgur.com direct CDN path; 429 if rate-limited (run less frequently)",
  },

  // ── yt-dlp resolution ───────────────────────────────────────────────────
  {
    platform: "YouTube",
    description: "First YouTube video (18 s)",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    expectedType: "video",
    expectCached: true,
    notes: "short — fast yt-dlp round trip",
  },
  {
    platform: "YouTube",
    description: "Short URL format (youtu.be)",
    url: "https://youtu.be/dQw4w9WgXcQ",
    expectedType: "video",
    expectCached: true,
    notes: "tests URL normalisation via youtu.be redirect",
  },
  {
    platform: "YouTube",
    description: "URL with &t= timestamp param",
    url: "https://www.youtube.com/watch?v=YE7VzlLtp-4&t=30",
    expectedType: "video",
    expectCached: true,
    notes: "tracking-param strip + yt-dlp ignores timestamp for download",
  },
  {
    platform: "YouTube",
    description: "Shorts (/shorts/ path)",
    // H7-s_7-WmBE was unavailable; use official YouTube Shorts example
    url: "https://www.youtube.com/shorts/SXHMnicI6Pg",
    expectedType: "video",
    expectCached: true,
  },
  {
    platform: "YouTube Music",
    description: "music.youtube.com → audioOnly path",
    url: "https://music.youtube.com/watch?v=ZbZSe6N_BXs",
    expectedType: "audio",
    expectCached: true,
    notes: "CANONICAL_HOSTS rewrites host; expects vcodec=none → type:audio",
  },
  {
    platform: "Vimeo",
    description: "Standard Vimeo video",
    url: "https://vimeo.com/370117268",
    // yt-dlp blocked by Vimeo TLS fingerprint; Cobalt also fails → link-preview → type:link
    expectedType: "link",
    expectCached: false,
    notes: "known yt-dlp limitation: Vimeo TLS fingerprint detection → full fallback chain",
  },
  {
    platform: "Streamable",
    description: "Streamable clip",
    url: "https://streamable.com/x5pgtv",
    expectedType: "video",
    expectCached: true,
  },
  {
    platform: "SoundCloud",
    description: "SoundCloud audio track",
    url: "https://soundcloud.com/forss/flickermood",
    expectedType: "audio",
    expectCached: true,
    notes: "bestaudio format, no video codec → type:audio",
  },
  {
    platform: "Dailymotion",
    description: "Dailymotion video",
    // x7tgd2t was deleted; use Dailymotion's own channel trailer
    url: "https://www.dailymotion.com/video/x8jqxh0",
    expectedType: "video",
    expectCached: true,
  },
  {
    platform: "Reddit",
    description: "Reddit native video post",
    url: "https://www.reddit.com/r/oddlysatisfying/comments/1kdbp4x/this_is_so_satisfying_to_watch/",
    expectedType: "video",
    expectCached: true,
    notes: "reddit pre-resolver: fetches .json, extracts reddit_video.fallback_url",
  },
  {
    platform: "Reddit",
    description: "Reddit GIF/AnimatedImage post",
    url: "https://www.reddit.com/r/gifs/comments/1fy6oxi/",
    // IP may be blocked from Reddit API; graceful degradation to type:link
    expectedType: "link",
    expectCached: false,
    notes: "AnimatedImage path; degrades to type:link if Reddit API blocks IP",
  },
  {
    platform: "Twitter/X",
    description: "Public video tweet (SpaceX launch)",
    // NASA tweet 1851645927467847869 has no video (image only); use a tweet with actual video
    url: "https://x.com/SpaceX/status/1679200938283565056",
    expectedType: "video",
    expectCached: true,
    notes: "yt-dlp strips google.com referer for twitter; needs cookies for some tweets",
  },

  // ── Iframe fallback ─────────────────────────────────────────────────────
  {
    platform: "Twitch",
    description: "Twitch clip (iframe embed)",
    url: "https://clips.twitch.tv/ToughAdorableKumquatDancingBanana-nvX4QlzJB57EuDKK",
    expectedType: "iframe",
    expectCached: false,
    notes: "parseMediaUrl regex → clips.twitch.tv/embed?clip=; no download",
  },
  {
    platform: "TikTok",
    description: "TikTok video (yt-dlp downloads; iframe is fallback only)",
    url: "https://www.tiktok.com/@tiktok/video/6829267836783971589",
    // yt-dlp successfully downloads TikTok before parseMediaUrl iframe fallback is reached
    expectedType: "video",
    expectCached: true,
    notes: "yt-dlp resolves TikTok directly; iframe embed only triggers if yt-dlp fails",
  },

  // ── Error / boundary ────────────────────────────────────────────────────
  {
    platform: "YouTube",
    description: "Invalid video ID (10-char, truncated)",
    url: "https://www.youtube.com/watch?v=AAAAAAAAAA",
    // YouTube regex requires exactly 11 chars; 10-char ID doesn't match → type:link (not iframe)
    expectedType: "link",
    expectCached: false,
    notes: "parseMediaUrl YouTube regex needs 11-char ID; 10-char AAAAAAAAAA → type:link",
  },
  {
    platform: "YouTube",
    description: "URL with playlist params",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxfake&index=2",
    expectedType: "video",
    expectCached: true,
    notes: "should resolve single video, ignore playlist params",
  },
  {
    platform: "Generic",
    description: "No extension, no platform match",
    url: "https://example.com/notafile",
    expectedType: "link",
    expectCached: false,
    notes: "full fallback chain fails → type:link",
  },
  {
    platform: "Direct CDN",
    description: "Image URL without file extension (content-type detection)",
    url: "https://httpbin.org/image/jpeg",
    // yt-dlp's generic extractor downloads it and ffmpeg wraps it → type:video (known limitation)
    // After fix: isDirectMediaUrl=false so yt-dlp still runs; httpbin has no extension to fast-path
    expectedType: "video",
    expectCached: true,
    notes: "extensionless image URL: misses fast path, yt-dlp downloads+normalizes to mp4 (limitation)",
  },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function post(path: string, body?: object, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  return res.json();
}

async function skipAlert(): Promise<void> {
  try {
    await post("/api/skip-alert");
  } catch {
    // best-effort
  }
}

async function clearQueue(): Promise<void> {
  try {
    await post("/api/queue/clear");
  } catch {
    // best-effort
  }
}

// ─── Result types ─────────────────────────────────────────────────────────────
type Status = "PASS" | "WARN" | "FAIL" | "TIMEOUT" | "ERROR";

interface Result {
  index: number;
  tc: TestCase;
  status: Status;
  actualType?: string;
  mediaUrl?: string;
  cached?: boolean;
  elapsed: number;
  error?: string;
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function statusTag(s: Status): string {
  const map: Record<Status, string> = {
    PASS: `${C.green}${C.bold} PASS ${C.reset}`,
    WARN: `${C.yellow}${C.bold} WARN ${C.reset}`,
    FAIL: `${C.red}${C.bold} FAIL ${C.reset}`,
    TIMEOUT: `${C.cyan}${C.bold} TIMEOUT ${C.reset}`,
    ERROR: `${C.red}${C.bold} ERROR ${C.reset}`,
  };
  return map[s];
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.slice(0, 40);
    return u.hostname + path + (u.pathname.length > 40 ? "…" : "");
  } catch {
    return url.slice(0, 60);
  }
}

// ─── Run one test ─────────────────────────────────────────────────────────────
async function runTest(tc: TestCase, index: number): Promise<Result> {
  const label = `[${index.toString().padStart(2, "0")}] ${C.bold}${tc.platform}${C.reset} — ${tc.description}`;
  process.stdout.write(`${label}\n     ${C.gray}${shortUrl(tc.url)}${C.reset}\n`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_S * 1000);
  const t0 = Date.now();

  try {
    const data = await post(
      "/api/trigger-test",
      { mediaUrl: tc.url, authorName: `test-runner`, text: `[${index}] ${tc.description}` },
      controller.signal
    );
    clearTimeout(timer);
    const elapsed = Date.now() - t0;

    if (!data.success || !data.payload) {
      const r: Result = { index, tc, status: "FAIL", elapsed, error: JSON.stringify(data) };
      process.stdout.write(`     ${statusTag("FAIL")} ${C.red}server returned error${C.reset} — ${r.error}\n`);
      return r;
    }

    const { type: actualType, mediaUrl } = data.payload;
    const cached = typeof mediaUrl === "string" && mediaUrl.startsWith("/api/media-cache/");

    let status: Status = "PASS";
    const issues: string[] = [];

    if (actualType !== tc.expectedType) {
      issues.push(`type: expected ${C.bold}${tc.expectedType}${C.reset} got ${C.bold}${actualType}${C.reset}`);
      status = "WARN";
    }
    if (tc.expectCached && !cached) {
      issues.push(
        `not cached (got ${C.dim}${typeof mediaUrl === "string" ? mediaUrl.slice(0, 60) : mediaUrl}${C.reset})`
      );
      if (status === "PASS") status = "WARN";
    }

    const elapsedStr = `${C.dim}${(elapsed / 1000).toFixed(1)}s${C.reset}`;
    const cacheStr = cached ? `${C.green}cached${C.reset}` : `${C.yellow}uncached${C.reset}`;
    const typeStr =
      actualType === tc.expectedType ? `${C.green}${actualType}${C.reset}` : `${C.yellow}${actualType}${C.reset}`;

    process.stdout.write(`     ${statusTag(status)} ${typeStr} · ${cacheStr} · ${elapsedStr}\n`);
    if (issues.length) {
      for (const issue of issues) process.stdout.write(`     ${C.yellow}⚠ ${issue}${C.reset}\n`);
    }
    if (tc.notes) {
      process.stdout.write(`     ${C.gray}ℹ ${tc.notes}${C.reset}\n`);
    }

    return { index, tc, status, actualType, mediaUrl, cached, elapsed };
  } catch (err: any) {
    clearTimeout(timer);
    const elapsed = Date.now() - t0;

    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      process.stdout.write(
        `     ${statusTag("TIMEOUT")} ${C.cyan}resolve exceeded ${TIMEOUT_S}s — skipping${C.reset}\n`
      );
      return { index, tc, status: "TIMEOUT", elapsed, error: `timeout after ${TIMEOUT_S}s` };
    }

    const msg = err.message || String(err);
    process.stdout.write(`     ${statusTag("ERROR")} ${C.red}${msg}${C.reset}\n`);
    return { index, tc, status: "ERROR", elapsed, error: msg };
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function printSummary(results: Result[]): void {
  const counts: Record<Status, number> = { PASS: 0, WARN: 0, FAIL: 0, TIMEOUT: 0, ERROR: 0 };
  for (const r of results) counts[r.status]++;
  const total = results.length;

  console.log(`\n${C.bold}━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(
    `  ${C.green}PASS${C.reset} ${counts.PASS}  ` +
      `${C.yellow}WARN${C.reset} ${counts.WARN}  ` +
      `${C.red}FAIL${C.reset} ${counts.FAIL}  ` +
      `${C.cyan}TIMEOUT${C.reset} ${counts.TIMEOUT}  ` +
      `${C.red}ERROR${C.reset} ${counts.ERROR}  ` +
      `${C.dim}/ ${total} total${C.reset}`
  );

  const nonPass = results.filter((r) => r.status !== "PASS");
  if (nonPass.length > 0) {
    console.log(`\n${C.bold}Non-passing cases:${C.reset}`);
    for (const r of nonPass) {
      const elapsed = `${(r.elapsed / 1000).toFixed(1)}s`;
      console.log(
        `  ${statusTag(r.status)} [${r.index.toString().padStart(2, "0")}] ${r.tc.platform} — ${r.tc.description} (${elapsed})`
      );
      if (r.error) console.log(`       ${C.dim}${r.error}${C.reset}`);
      if (r.actualType && r.actualType !== r.tc.expectedType) {
        console.log(`       ${C.dim}expected type:${r.tc.expectedType} got:${r.actualType}${C.reset}`);
      }
    }
  }

  const avgMs = results.reduce((s, r) => s + r.elapsed, 0) / results.length;
  const slowest = [...results].sort((a, b) => b.elapsed - a.elapsed).slice(0, 3);
  console.log(`\n${C.bold}Timing:${C.reset} avg ${(avgMs / 1000).toFixed(1)}s · slowest:`);
  for (const r of slowest) {
    console.log(`  ${(r.elapsed / 1000).toFixed(1)}s — ${r.tc.platform}: ${r.tc.description}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Filter
  const cases = FILTER
    ? TESTS.filter(
        (tc) => tc.platform.toLowerCase().includes(FILTER!) || tc.description.toLowerCase().includes(FILTER!)
      )
    : TESTS;

  if (cases.length === 0) {
    console.error(`No test cases match filter "${FILTER}"`);
    process.exit(1);
  }

  // Verify server is up
  try {
    const res = await fetch(`${BASE_URL}/api/settings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err: any) {
    console.error(`${C.red}${C.bold}Server not reachable at ${BASE_URL}${C.reset} — ${err.message}`);
    console.error("Start it with: npm run dev");
    process.exit(1);
  }

  console.log(`${C.bold}${C.magenta}Media queue test runner${C.reset}`);
  console.log(
    `${C.dim}Server: ${BASE_URL} · Timeout: ${TIMEOUT_S}s · Cases: ${cases.length} · Auto-skip: ${AUTO_SKIP}${C.reset}`
  );
  if (FILTER) console.log(`${C.dim}Filter: "${FILTER}"${C.reset}`);
  console.log();

  await clearQueue();

  const results: Result[] = [];

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const result = await runTest(tc, i + 1);
    results.push(result);

    if (AUTO_SKIP) {
      await skipAlert();
    }

    if (i < cases.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    console.log();
  }

  printSummary(results);

  // Exit code reflects failures
  const hardFails = results.filter((r) => r.status === "FAIL" || r.status === "ERROR").length;
  process.exit(hardFails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
