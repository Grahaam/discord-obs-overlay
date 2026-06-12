import { app, BrowserWindow, Tray, Menu, clipboard, ipcMain, utilityProcess, nativeImage, dialog } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import net from "net";

// ── State ──────────────────────────────────────────────────────────────────────
let mainWindow = null;
let wizardWindow = null;
let tray = null;
let serverProcess = null;
let serverPort = null;
app.isQuitting = false;
let serverCrashHandled = false;

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

function waitForServer(port, timeoutMs = 30000) {
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
      if (Date.now() > deadline) return reject(new Error("Server did not start within 30s"));
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
    },
    cwd: dataDir,
    stdio: ["ignore", "pipe", "pipe"],
    serviceName: "discord-obs-overlay-server",
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
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
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
    height: 500,
    resizable: false,
    title: "LiveChat — Setup",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wizardWindow.loadFile(path.join(__dirname, "wizard.html"));
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Dashboard",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { label: "Copy OBS Overlay URL", click: () => clipboard.writeText(`http://127.0.0.1:${port}/overlay`) },
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
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ── IPC handlers ───────────────────────────────────────────────────────────────
/** Boot the server once; on retry (e.g. wrong token re-entered in the wizard) reuse it. */
async function ensureServer(dataDir) {
  if (serverPort && serverProcess) return serverPort;
  const port = await findFreePort();
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
  return new Promise((resolve, reject) => {
    async function poll() {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/bot-status`);
        const { status, errorMsg } = await res.json();
        if (status === "connected") return resolve();
        if (status === "error") {
          return reject(new Error(errorMsg || "Bot connection failed — check your token."));
        }
      } catch {
        // transient server hiccup — keep polling until the deadline
      }
      if (Date.now() > deadline) {
        return reject(new Error("Timed out waiting for the Discord bot to connect."));
      }
      setTimeout(poll, 500);
    }
    poll();
  });
}

ipcMain.handle("complete-setup", async (event, { token, channelId }) => {
  // Only accept calls from the wizard window.
  if (!wizardWindow || event.sender !== wizardWindow.webContents) {
    throw new Error("Unauthorized sender");
  }
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Token is required");
  }
  if (typeof channelId !== "string" || !/^\d+$/.test(channelId)) {
    throw new Error("Channel ID must be a numeric snowflake");
  }

  const dataDir = isDev ? app.getAppPath() : app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });

  const port = await ensureServer(dataDir);

  // Push config through the server's own settings API: it persists .env /
  // settings.json in its cwd (dataDir) AND (re)connects the Discord bot —
  // writing the files ourselves after the fork would leave the bot
  // disconnected until the next app restart.
  const base = `http://127.0.0.1:${port}`;
  const current = await (await fetch(`${base}/api/settings`)).json();
  const res = await fetch(`${base}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...current, discordToken: token.trim(), channelId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Saving settings failed (HTTP ${res.status})`);
  }

  // Surface bad tokens here instead of claiming success and opening a
  // dashboard with a dead bot.
  await waitForBotConnection(port);

  createMainWindow(port);
  createTray(port);
  wizardWindow?.close();
});

ipcMain.handle("get-port", () => serverPort);

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const dataDir = isDev ? app.getAppPath() : app.getPath("userData");
  const hasSettings = fs.existsSync(path.join(dataDir, "settings.json"));

  if (!hasSettings) {
    createWizardWindow();
    return;
  }

  try {
    serverPort = await findFreePort();
    forkServer(serverPort, dataDir);
    await waitForServer(serverPort);
    createMainWindow(serverPort);
    createTray(serverPort);
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
app.on("will-quit", () => {
  serverProcess?.kill();
});

// Keep app alive when all windows are closed (tray mode)
app.on("window-all-closed", () => {
  /* intentionally empty */
});
