"use strict";
const { spawn } = require("child_process");
const path = require("path");

const isWin = process.platform === "win32";
const VENV_BIN = path.join(__dirname, "..", ".venv", isWin ? "Scripts" : "bin");
const env = { ...process.env, PATH: VENV_BIN + path.delimiter + (process.env.PATH || "") };

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("[run-with-venv] No command specified.");
  process.exit(1);
}

const child = spawn(cmd, args, {
  stdio: "inherit",
  shell: isWin, // required: Windows npm bin shims are .cmd files
  env,
});

child.on("error", (err) => {
  console.error(`[run-with-venv] ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
