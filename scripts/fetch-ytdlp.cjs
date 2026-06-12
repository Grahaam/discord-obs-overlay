// scripts/fetch-ytdlp.cjs
"use strict";

const ASSET_BY_PLATFORM = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

function assetNameForPlatform(platform) {
  const name = ASSET_BY_PLATFORM[platform];
  if (!name) throw new Error(`unsupported platform: ${platform}`);
  return name;
}

function parseSha256Sums(text, assetName) {
  for (const line of text.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === assetName) return hash;
  }
  return null;
}

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Pinned for reproducible builds; bump to adopt a newer baseline. Runtime
// `yt-dlp -U` keeps end users current regardless of this value.
const YTDLP_VERSION = "2026.06.09";
const BIN_DIR = path.join(__dirname, "..", "electron", "bin");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function platformFromArgs() {
  const i = process.argv.indexOf("--platform");
  return i !== -1 ? process.argv[i + 1] : process.platform;
}

async function download(url) {
  const res = await fetch(url); // global fetch follows redirects
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const platform = platformFromArgs();
  const asset = assetNameForPlatform(platform);
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;
  const target = path.join(BIN_DIR, asset);

  const sums = (await download(`${base}/SHA2-256SUMS`)).toString("utf8");
  const expected = parseSha256Sums(sums, asset);
  if (!expected) throw new Error(`no checksum for ${asset} in SHA2-256SUMS`);

  if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === expected) {
    console.log(`[fetch-ytdlp] ${asset} already present and verified`);
    return;
  }

  console.log(`[fetch-ytdlp] downloading ${asset} (${YTDLP_VERSION})`);
  const bin = await download(`${base}/${asset}`);
  const actual = sha256(bin);
  if (actual !== expected) {
    throw new Error(`checksum mismatch for ${asset}: ${actual} != ${expected}`);
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.writeFileSync(target, bin);
  if (platform !== "win32") fs.chmodSync(target, 0o755);
  console.log(`[fetch-ytdlp] wrote ${target}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[fetch-ytdlp] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { assetNameForPlatform, parseSha256Sums };
