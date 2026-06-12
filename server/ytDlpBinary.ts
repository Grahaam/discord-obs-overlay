import fs from "fs";
import path from "path";

const ASSET_BY_PLATFORM: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

export function standaloneBinaryName(platform: NodeJS.Platform = process.platform): string {
  const name = ASSET_BY_PLATFORM[platform];
  if (!name) throw new Error(`unsupported platform: ${platform}`);
  return name;
}

export interface StandaloneResult {
  path: string;
  updatable: boolean;
}

interface ResolveOpts {
  appPath?: string;
  cwd?: string;
  platform?: NodeJS.Platform;
}

/**
 * Resolve the bundled standalone yt-dlp. Only meaningful when packaged
 * (appPath set by the Electron fork). Copies the read-only bundled binary
 * into a writable dir (cwd/bin) so `yt-dlp -U` can replace it in place;
 * falls back to the read-only bundled copy (not self-updatable) if the copy
 * fails.
 *
 * Deliberately does NOT exec the binary to verify it. The PyInstaller
 * standalone self-extracts on first run (10s+), and on an unsigned build
 * macOS Gatekeeper scans it on first exec — doing that synchronously here
 * (this runs during server module import) blew past the Electron health-check
 * budget and the app failed to start. The first real media job pays the
 * extraction cost instead, off the startup path.
 */
export function resolveStandalone(opts: ResolveOpts = {}): StandaloneResult | null {
  const appPath = opts.appPath ?? process.env.APP_PATH;
  if (!appPath) return null;
  const cwd = opts.cwd ?? process.cwd();
  const platform = opts.platform ?? process.platform;
  const name = standaloneBinaryName(platform);

  const bundled = path.join(appPath, "electron", "bin", name);
  if (!fs.existsSync(bundled)) return null;

  const target = path.join(cwd, "bin", name);
  try {
    if (!fs.existsSync(target)) {
      // Copy to a temp sibling and rename so a crash/disk-full mid-copy never
      // leaves a partial file that satisfies existsSync on the next launch.
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.tmp`;
      try {
        fs.copyFileSync(bundled, tmp);
        if (platform !== "win32") fs.chmodSync(tmp, 0o755);
        fs.renameSync(tmp, target);
      } catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
    }
    return { path: target, updatable: true };
  } catch {
    // Copy failed — run the read-only bundled binary directly (not self-updatable).
    return { path: bundled, updatable: false };
  }
}
