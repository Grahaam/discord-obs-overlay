// Native modules (better-sqlite3) are compiled for ONE runtime ABI at a time.
// `npm run electron:dev` / packaging rebuild them for Electron, which makes
// them unloadable under plain Node (`npm run dev`, `npm start`) with a
// NODE_MODULE_VERSION error. This runs before those scripts and rebuilds for
// Node only when the current build does not load, so the common case is free.
"use strict";
const { execSync } = require("child_process");

try {
  require("better-sqlite3")(":memory:").close();
} catch (err) {
  if (!/NODE_MODULE_VERSION|not a valid Win32 application|invalid ELF header/.test(String(err))) throw err;
  console.log("[native] better-sqlite3 was built for Electron, rebuilding for Node...");
  execSync("npm rebuild better-sqlite3", { stdio: "inherit" });
}
