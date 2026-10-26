const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  ipcMain,
  utilityProcess,
  nativeImage,
  dialog,
  shell,
} = require("electron");
const path = require("path");
const { randomBytes } = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const { initAutoUpdate } = require("./updater.cjs");

// ── State ──────────────────────────────────────────────────────────────────────
let mainWindow = null;
let wizardWindow = null;
let tray = null;
let serverProcess = null;
let serverPort = null;
let apiToken = null;
app.isQuitting = false;
let serverCrashHandled = false;
let updater = null;
let pendingUpdateVersion = null; // set once an update is downloaded
let installUpdateOnQuit = false;

// ── Single-instance lock ───────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

app.on("second-instance", () => {
  // Restore whichever window is open when the user launches a duplicate.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else if (wizardWindow) {
    wizardWindow.show();
    wizardWindow.focus();
  }
});

const isDev = !app.isPackaged;

// ── Utilities ──────────────────────────────────────────────────────────────────
function findFreePort(start = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(start, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      if (start >= 3099) return reject(new Error("No free port found in range 3000-3099"));
      findFreePort(start + 1).then(resolve, reject);
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

/**
 * Port for the server. The OBS browser source URL (and the dashboard's localStorage, whose origin
 * includes the port) depend on it, so reuse the last port when it is still free and only scan
 * for another one if something else took it.
 */
async function pickPort(dataDir) {
  const portFile = path.join(dataDir, "last-port.json");
  let last = null;
  try {
    last = JSON.parse(fs.readFileSync(portFile, "utf8")).port;
  } catch {
    // first launch or unreadable file: fall through to the scan
  }
  const port = Number.isInteger(last) && (await isPortFree(last)) ? last : await findFreePort();
  if (last !== null && port !== last) {
    console.warn(`[main] Port ${last} is taken, using ${port}: the OBS overlay URL has changed`);
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(portFile, JSON.stringify({ port }));
  } catch (err) {
    console.warn("[main] Could not remember the port:", err);
  }
  return port;
}

/**
 * Secret every /api call and socket must present (see server/apiGuard.ts). Persisted next to
 * last-port.json so the OBS URLs (which carry it as ?k=) keep working across launches.
 */
function loadApiToken(dataDir) {
  const tokenFile = path.join(dataDir, "api-token.json");
  try {
    const stored = JSON.parse(fs.readFileSync(tokenFile, "utf8")).token;
    if (typeof stored === "string" && stored.length >= 32) return stored;
  } catch {
    // first launch or unreadable file: generate a new one
  }
  const token = randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tokenFile, JSON.stringify({ token }), { mode: 0o600 });
  } catch (err) {
    console.warn("[main] Could not remember the API token: the OBS overlay URL will change next launch", err);
  }
  return token;
}

const authHeaders = () => ({ "X-LiveChat-Token": apiToken });

/** GET/POST the local server and return its JSON; throws a readable error on a non-OK answer. */
async function serverJson(url, options) {
  const res = await fetch(url, { ...options, headers: { ...options?.headers, ...authHeaders() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server request failed (HTTP ${res.status}): ${url.split("/api/")[1]}`);
  return body;
}

// 90s: on an unsigned build launched from a quarantined .dmg, macOS Gatekeeper
// scans the bundled binaries (native modules, ffmpeg, yt-dlp) on first exec,
// which can add many seconds to the first cold boot.
function waitForServer(port, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      http
        .get(`http://127.0.0.1:${port}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve();
          retry();
        })
        .on("error", retry);
    }
    function retry() {
      if (Date.now() > deadline)
        return reject(new Error(`Server did not start within ${Math.round(timeoutMs / 1000)}s`));
      setTimeout(attempt, 500);
    }
    attempt();
  });
}

// ── Server fork ────────────────────────────────────────────────────────────────
function forkServer(port, dataDir) {
  const serverScript = path.join(app.getAppPath(), "dist", "server.mjs");
  serverProcess = utilityProcess.fork(serverScript, [], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      APP_PATH: app.getAppPath(),
      // Writable data root (settings, token, DB, cache). See server/paths.ts.
      DATA_DIR: dataDir,
      LIVECHAT_API_TOKEN: apiToken,
    },
    cwd: dataDir,
    stdio: ["ignore", "pipe", "pipe"],
    serviceName: "livechat-server",
  });
  serverProcess.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.on("exit", (code) => {
    if (!app.isQuitting) console.error(`[server] exited unexpectedly (code ${code})`);
    // Only surface a recovery dialog if the main window was already created
    // (server had reached connected state). During initial startup the
    // whenReady catch already handles failures via its own Retry/Quit dialog.
    if (!app.isQuitting && mainWindow && !serverCrashHandled) {
      serverCrashHandled = true; // guard before dialog to prevent re-entrancy
      dialog
        .showMessageBox({
          type: "error",
          title: "Server stopped",
          message: "The background server stopped unexpectedly.",
          detail: `Exit code: ${code}. Restart the app to reconnect.`,
          buttons: ["Restart", "Quit"],
        })
        .then(({ response }) => {
          if (response === 0) app.relaunch();
          app.quit();
        })
        .catch(console.error);
    }
  });
}

// ── Windows ────────────────────────────────────────────────────────────────────
function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "LiveChat",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // ?k= makes the server plant its auth cookie for this window (every later fetch / socket carries it)
  mainWindow.loadURL(`http://127.0.0.1:${port}/?k=${apiToken}`);
  // Links with target="_blank" (Discord invite, Developer Portal) would open in a
  // bare Electron window where the user is not logged in. Send them to the
  // default browser instead, and only for http(s) URLs.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createWizardWindow() {
  wizardWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    title: "LiveChat — Setup",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wizardWindow.loadFile(path.join(__dirname, "wizard.html"));
  // Same as the main window: never let a link spawn a bare Electron window.
  wizardWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wizardWindow.on("closed", () => {
    wizardWindow = null;
    // If setup was never completed there is no tray or main window — quit cleanly.
    if (!tray && !mainWindow) app.quit();
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────────
function createTray(port) {
  const iconPath = path.join(__dirname, "assets", "tray.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("LiveChat");
  refreshTrayMenu(port);
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// Rebuilt when an update finishes downloading, to add the "Restart" item.
function refreshTrayMenu(port) {
  if (!tray) return;
  const updateItems = pendingUpdateVersion
    ? [
        {
          label: `Restart to update (v${pendingUpdateVersion})`,
          click: () => {
            installUpdateOnQuit = true;
            app.isQuitting = true;
            app.quit(); // clean server shutdown first, then the installer runs (see will-quit)
          },
        },
        { type: "separator" },
      ]
    : [];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...updateItems,
      {
        label: "Open Dashboard",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Copy OBS Overlay URL",
        click: () => clipboard.writeText(`http://127.0.0.1:${port}/overlay?k=${apiToken}`).catch(() => {}),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function startAutoUpdate(port) {
  if (updater) return;
  updater = initAutoUpdate({
    onUpdateReady: (version) => {
      pendingUpdateVersion = version;
      refreshTrayMenu(port);
      // displayBalloon is a Windows-only notification bubble on the tray icon.
      tray?.displayBalloon?.({
        title: "LiveChat update ready",
        content: `Version ${version} will install when you quit, or right-click the tray icon to restart now.`,
      });
    },
  });
}

// ── IPC handlers ───────────────────────────────────────────────────────────────
/** Boot the server once; on retry (e.g. wrong token re-entered in the wizard) reuse it. */
async function ensureServer(dataDir) {
  if (serverPort && serverProcess) return serverPort;
  const port = await pickPort(dataDir);
  apiToken = loadApiToken(dataDir);
  forkServer(port, dataDir);
  try {
    await waitForServer(port);
  } catch (err) {
    serverProcess?.kill();
    serverProcess = null;
    throw err;
  }
  serverPort = port;
  return port;
}

/** Poll /api/bot-status until the bot is connected, errored, or we time out. */
function waitForBotConnection(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  return new Promise((resolve, reject) => {
    async function poll() {
      try {
        const { status, errorMsg } = await serverJson(`http://127.0.0.1:${port}/api/bot-status`);
        if (status === "connected") return resolve();
        if (status === "error") {
          return reject(new Error(errorMsg || "Bot connection failed — check your token."));
        }
      } catch (e) {
        // transient hiccup or an HTTP error from serverJson: keep polling, but report it if we time out
        lastError = e;
      }
      if (Date.now() > deadline) {
        const detail = lastError ? ` Last error: ${lastError.message}` : "";
        return reject(new Error(`Timed out waiting for the Discord bot to connect.${detail}`));
      }
      setTimeout(poll, 500);
    }
    poll();
  });
}

function assertWizardSender(event) {
  // Only accept calls from the wizard window.
  if (!wizardWindow || event.sender !== wizardWindow.webContents) {
    throw new Error("Unauthorized sender");
  }
}

/** Save settings through the server's own API (see the comment in setup-token). */
async function saveSettings(port, patch) {
  const base = `http://127.0.0.1:${port}`;
  const current = await serverJson(`${base}/api/settings`);
  const res = await fetch(`${base}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ...current, ...patch }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Saving settings failed (HTTP ${res.status})`);
  }
}

/** The wizard's language becomes the dashboard's; anything else is ignored (keeps the server default). */
function languagePatch(language) {
  return language === "fr" || language === "en" ? { language } : {};
}

async function fetchChannels(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/discord/channels`, { headers: authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Listing channels failed (HTTP ${res.status})`);
  return body;
}

// Wizard step 2: boot the server, connect the bot with the pasted token (no channel yet).
ipcMain.handle("setup-token", async (event, { token, language }) => {
  assertWizardSender(event);
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Token is required");
  }

  const dataDir = isDev ? app.getAppPath() : app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });

  const port = await ensureServer(dataDir);

  // Push config through the server's own settings API: it persists .env /
  // settings.json in its cwd (dataDir) AND (re)connects the Discord bot —
  // writing the files ourselves after the fork would leave the bot
  // disconnected until the next app restart.
  await saveSettings(port, { discordToken: token.trim(), channelId: "", ...languagePatch(language) });

  // The settings API only reconnects when the token changed. After a failed
  // attempt re-pasting the same token would otherwise keep the old error.
  const { status } = await serverJson(`http://127.0.0.1:${port}/api/bot-status`);
  if (status === "error" || status === "disconnected") {
    await serverJson(`http://127.0.0.1:${port}/api/bot-reconnect`, { method: "POST" });
  }

  // Surface bad tokens here instead of claiming success and moving on with a dead bot.
  await waitForBotConnection(port);

  const { botUser } = await serverJson(`http://127.0.0.1:${port}/api/bot-status`);
  const { inviteUrl } = await fetchChannels(port);
  return { botTag: botUser, inviteUrl };
});

// Wizard step 3: servers/channels the bot can see (also used by the Refresh button).
ipcMain.handle("list-channels", async (event) => {
  assertWizardSender(event);
  if (!serverPort) throw new Error("Server not started");
  return fetchChannels(serverPort);
});

// Wizard step 3 "Finish": save the channel, then switch to the dashboard.
ipcMain.handle("setup-channel", async (event, { channelId, language }) => {
  assertWizardSender(event);
  if (typeof channelId !== "string" || !/^\d+$/.test(channelId)) {
    throw new Error("Channel ID must be a numeric snowflake");
  }
  if (!serverPort) throw new Error("Server not started");
  const port = serverPort;

  // Language again: the user may have switched it since step 2.
  await saveSettings(port, { channelId, ...languagePatch(language) });
  // Channel changes reconnect the bot; wait so the dashboard opens on a live bot.
  await waitForBotConnection(port);

  createMainWindow(port);
  createTray(port);
  startAutoUpdate(port);
  wizardWindow?.close();
});

// The wizard cannot open links itself (contextIsolation); restrict to the Discord pages it links to.
ipcMain.handle("open-external", (event, url) => {
  assertWizardSender(event);
  if (typeof url !== "string" || !/^https:\/\/discord\.com\//.test(url)) {
    throw new Error("URL not allowed");
  }
  return shell.openExternal(url);
});

ipcMain.handle("get-port", () => serverPort);

ipcMain.handle("open-user-assets", async () => {
  const dir = path.join(isDev ? app.getAppPath() : app.getPath("userData"), "user-assets");
  fs.mkdirSync(dir, { recursive: true });
  // openPath resolves to an error string ("" on success) instead of throwing.
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
});

/**
 * The wizard writes settings.json as soon as the token is saved (step 2), so
 * the file alone does not mean setup finished: a user who closed the wizard
 * before picking a channel must see it again.
 */
function isSetupComplete(dataDir) {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8"));
    return typeof settings.channelId === "string" && settings.channelId !== "";
  } catch {
    return false;
  }
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const dataDir = isDev ? app.getAppPath() : app.getPath("userData");
  if (!isSetupComplete(dataDir)) {
    createWizardWindow();
    return;
  }

  try {
    serverPort = await pickPort(dataDir);
    forkServer(serverPort, dataDir);
    await waitForServer(serverPort);
    createMainWindow(serverPort);
    createTray(serverPort);
    startAutoUpdate(serverPort);
  } catch (err) {
    console.error("[main] Failed to start server:", err);
    const { response } = await dialog.showMessageBox({
      type: "error",
      title: "Startup failed",
      message: "LiveChat could not start the server.",
      detail: String(err),
      buttons: ["Retry", "Quit"],
    });
    if (response === 0) {
      app.relaunch();
    }
    app.quit();
  }
});

// macOS: clicking dock icon re-shows window
app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
// Ask the server to shut down cleanly (restore OBS transforms, close the DB)
// instead of kill(), which is an instant hard kill on Windows. will-quit is
// synchronous, so we cancel the quit once, wait for the server to exit, then
// quit for real. A 5 s timer hard-kills a server that hangs (e.g. OBS frozen).
let serverStopped = false;
app.on("will-quit", (e) => {
  if (serverStopped || !serverProcess) return;
  e.preventDefault();
  const proc = serverProcess;
  const finish = () => {
    if (serverStopped) return;
    serverStopped = true;
    clearTimeout(fallback);
    // quitAndInstall quits the app and runs the NSIS installer silently, then
    // relaunches. Only reached after the server has exited cleanly.
    if (installUpdateOnQuit && updater) updater.quitAndInstall(true, true);
    else app.quit();
  };
  const fallback = setTimeout(() => {
    console.error("[main] server did not exit within 5s, killing it");
    proc.kill();
    finish();
  }, 5000);
  proc.once("exit", finish);
  proc.postMessage({ type: "shutdown" });
});

// Keep app alive when all windows are closed (tray mode)
app.on("window-all-closed", () => {
  /* intentionally empty */
});
