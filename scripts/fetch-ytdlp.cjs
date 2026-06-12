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

module.exports = { assetNameForPlatform, parseSha256Sums };
