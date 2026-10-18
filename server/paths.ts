import path from "path";

/**
 * Two roots, on purpose:
 *
 * - APP_DIR holds the shipped code (dist/, package.json, bundled binaries).
 *   In the installed Electron app it lives under Program Files / the .app
 *   bundle, which may be read-only for normal users, so we never write there.
 * - DATA_DIR holds everything the app writes (settings, token, DB, cache).
 *   Electron passes app.getPath("userData") (e.g. %APPDATA%/LiveChat), which
 *   survives app updates and reinstalls.
 *
 * Both fall back to process.cwd() so `npm run dev` / `npm start` keep using
 * the repo folder exactly like before.
 */
const appDir = process.env.APP_PATH || process.cwd();
const dataDir = process.env.DATA_DIR || process.cwd();

export const APP_PATHS = {
  root: appDir,
  distDir: path.join(appDir, "dist"),
  packageJson: path.join(appDir, "package.json"),
  venvDir: path.join(appDir, ".venv"),
};

export const DATA_PATHS = {
  root: dataDir,
  settingsFile: path.join(dataDir, "settings.json"),
  envFile: path.join(dataDir, ".env"),
  cookiesFile: path.join(dataDir, "cookies.txt"),
  dbFile: path.join(dataDir, "overlay.db"),
  mediaCacheDir: path.join(dataDir, "media_cache"),
  binDir: path.join(dataDir, "bin"),
};
