// Auto-update via electron-updater + GitHub Releases.
//
// How it works: on launch we fetch latest.yml (Windows) / latest-linux.yml
// from the newest GitHub Release (see build.publish in package.json and
// .github/workflows/release.yml). If its version is newer than ours, the
// installer is downloaded in the background; once it is ready we tell the
// tray, which shows a notification and a "Restart to update" menu item.
// If the user never clicks it, the update installs when the app quits.
//
// macOS is skipped on purpose: Squirrel.Mac refuses to apply updates to an
// unsigned app, and our mac builds are unsigned (see docs/CODE-SIGNING.md).
"use strict";
const { app } = require("electron");

function initAutoUpdate({ onUpdateReady }) {
  // Dev builds have no app-update.yml, and updating `electron .` makes no sense.
  if (!app.isPackaged || process.platform === "darwin") return null;

  // Required lazily: electron-updater reads app metadata at import time.
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on("update-downloaded", (info) => onUpdateReady(info.version));
  // Offline, GitHub rate limit, no release yet... never crash the app for it.
  autoUpdater.on("error", (err) => console.error("[updater]", err?.message || err));

  autoUpdater.checkForUpdates().catch((err) => console.error("[updater]", err?.message || err));
  return autoUpdater;
}

module.exports = { initAutoUpdate };
