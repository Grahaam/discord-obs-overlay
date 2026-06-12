import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

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

function runsOk(bin: string): boolean {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the bundled standalone yt-dlp. Only meaningful when packaged
 * (appPath set by the Electron fork). Copies the read-only bundled binary
 * into a writable dir (cwd/bin) so `yt-dlp -U` can replace it in place;
 * falls back to running the read-only bundled copy (not self-updatable) if
 * the copy fails.
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
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(bundled, target);
      if (platform !== "win32") fs.chmodSync(target, 0o755);
    }
    if (runsOk(target)) return { path: target, updatable: true };
  } catch {
    /* copy/exec failed — fall through to read-only bundled */
  }
  if (runsOk(bundled)) return { path: bundled, updatable: false };
  return null;
}
