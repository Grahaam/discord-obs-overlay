// Rebuild native modules for Electron's ABI (Node and Electron use different
// ABIs, so a module compiled for one cannot load in the other).
//
// Only better-sqlite3 is rebuilt: re2 (pulled in by metascraper) is optional
// at runtime (url-regex-safe falls back to RegExp) and compiling it needs
// Visual Studio / Xcode tools. That is also why package.json sets
// build.npmRebuild=false instead of letting electron-builder rebuild everything.
//
// Usage: node scripts/electron-rebuild.cjs [--arch x64|arm64]  (default: host arch)
"use strict";
const { rebuild } = require("@electron/rebuild");

const archFlag = process.argv.indexOf("--arch");
const arch = archFlag !== -1 ? process.argv[archFlag + 1] : process.arch;

rebuild({
  buildPath: process.cwd(),
  electronVersion: require("electron/package.json").version,
  arch,
  force: true,
  onlyModules: ["better-sqlite3"],
})
  .then(() => console.log(`[native] better-sqlite3 rebuilt for Electron (${arch})`))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
