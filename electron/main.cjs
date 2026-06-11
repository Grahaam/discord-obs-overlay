'use strict';

const { app, BrowserWindow, Tray, Menu, clipboard, ipcMain, utilityProcess, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// ── State ──────────────────────────────────────────────────────────────────────
let mainWindow = null;
let wizardWindow = null;
let tray = null;
let serverProcess = null;
let serverPort = null;
app.isQuitting = false;

const isDev = !app.isPackaged;

// ── Utilities ──────────────────────────────────────────────────────────────────
function findFreePort(start = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(start, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (start >= 3099) return reject(new Error('No free port found in range 3000-3099'));
      findFreePort(start + 1).then(resolve, reject);
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() > deadline) return reject(new Error('Server did not start within 30s'));
      setTimeout(attempt, 500);
    }
    attempt();
  });
}

// ── Server fork ────────────────────────────────────────────────────────────────
function forkServer(port, dataDir) {
  const serverScript = path.join(app.getAppPath(), 'dist', 'server.mjs');
  serverProcess = utilityProcess.fork(serverScript, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      APP_PATH: app.getAppPath(),
    },
    cwd: dataDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    serviceName: 'discord-obs-overlay-server',
  });
  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.on('exit', (code) => {
    if (!app.isQuitting) console.error(`[server] exited unexpectedly (code ${code})`);
  });
}

// ── Windows ────────────────────────────────────────────────────────────────────
function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Discord OBS Overlay',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createWizardWindow() {
  wizardWindow = new BrowserWindow({
    width: 520,
    height: 500,
    resizable: false,
    title: 'Discord OBS Overlay — Setup',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wizardWindow.loadFile(path.join(__dirname, 'wizard.html'));
  wizardWindow.on('closed', () => { wizardWindow = null; });
}

// ── Tray ───────────────────────────────────────────────────────────────────────
function createTray(port) {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('Discord OBS Overlay');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Copy OBS Overlay URL', click: () => clipboard.writeText(`http://127.0.0.1:${port}/overlay`) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── IPC handlers ───────────────────────────────────────────────────────────────
ipcMain.handle('complete-setup', async (_event, { token, channelId }) => {
  const dataDir = isDev ? app.getAppPath() : app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.env'), `DISCORD_TOKEN=${token}\n`, 'utf8');
  fs.writeFileSync(
    path.join(dataDir, 'settings.json'),
    JSON.stringify({ channelId }, null, 2),
    'utf8'
  );

  serverPort = await findFreePort();
  forkServer(serverPort, dataDir);
  await waitForServer(serverPort);

  createMainWindow(serverPort);
  createTray(serverPort);
  wizardWindow?.close();
});

ipcMain.handle('get-port', () => serverPort);

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const dataDir = isDev ? app.getAppPath() : app.getPath('userData');
  const hasSettings = fs.existsSync(path.join(dataDir, 'settings.json'));

  if (!hasSettings) {
    createWizardWindow();
    return;
  }

  serverPort = await findFreePort();
  forkServer(serverPort, dataDir);
  await waitForServer(serverPort);
  createMainWindow(serverPort);
  createTray(serverPort);
});

// macOS: clicking dock icon re-shows window
app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => { serverProcess?.kill(); });

// Keep app alive when all windows are closed (tray mode)
app.on('window-all-closed', () => { /* intentionally empty */ });
