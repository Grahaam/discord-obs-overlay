"use strict";
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const isWin = process.platform === "win32";
const ROOT = path.resolve(__dirname, "..");
const VENV = path.join(ROOT, ".venv");
const VENV_PYTHON = path.join(VENV, isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python");

const WIN_CANDIDATES = [
  ["py", ["-3.12"]],
  ["py", ["-3.11"]],
  ["py", ["-3.10"]],
  ["py", ["-3"]],
  ["python", []],
];
const UNIX_CANDIDATES = [
  ["python3.12", []],
  ["python3.11", []],
  ["python3.10", []],
  ["python3", []],
];
const VERSION_CHECK = ["-c", "import sys; exit(0 if sys.version_info >= (3,10) else 1)"];

function findPython() {
  for (const [cmd, extra] of isWin ? WIN_CANDIDATES : UNIX_CANDIDATES) {
    try {
      execFileSync(cmd, [...extra, ...VERSION_CHECK], { stdio: "ignore" });
      return [cmd, extra];
    } catch {}
  }
  return null;
}

// If yt-dlp is already on PATH, no venv needed.
try {
  execFileSync("yt-dlp", ["--version"], { stdio: "ignore" });
  console.log("[Setup] yt-dlp found on PATH - skipping venv setup.");
  process.exit(0);
} catch {}

console.log("[Setup] yt-dlp venv setup...");
const found = findPython();
if (!found) {
  console.warn("[Setup] Python 3.10+ not found - skipping venv.");
  console.warn("[Setup] App will use youtube-dl-exec bundled binary instead.");
  process.exit(0);
}

try {
  const [pythonExe, extraArgs] = found;
  if (!fs.existsSync(VENV)) {
    console.log("[Setup] Creating virtual environment...");
    execFileSync(pythonExe, [...extraArgs, "-m", "venv", VENV], { stdio: "inherit" });
  }
  execFileSync(VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "pip"], { stdio: "inherit" });
  execFileSync(VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "yt-dlp"], { stdio: "inherit" });
  console.log("[Setup] Done.");
} catch (err) {
  console.warn("[Setup] venv/pip setup failed (non-fatal):", err.message);
  console.warn("[Setup] App will use system yt-dlp or youtube-dl-exec instead.");
}
