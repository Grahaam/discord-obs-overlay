// scripts/fetch-ytdlp.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const { assetNameForPlatform, parseSha256Sums } = require("./fetch-ytdlp.cjs");

test("assetNameForPlatform maps each platform to the standalone asset", () => {
  assert.equal(assetNameForPlatform("win32"), "yt-dlp.exe");
  assert.equal(assetNameForPlatform("darwin"), "yt-dlp_macos");
  assert.equal(assetNameForPlatform("linux"), "yt-dlp_linux");
});

test("assetNameForPlatform throws on unsupported platform", () => {
  assert.throws(() => assetNameForPlatform("aix"), /unsupported platform/i);
});

test("parseSha256Sums returns the hash for a given asset", () => {
  const sums = [
    "abc123  yt-dlp.exe",
    "def456  yt-dlp_macos",
    "789aaa  yt-dlp_linux",
  ].join("\n");
  assert.equal(parseSha256Sums(sums, "yt-dlp_macos"), "def456");
});

test("parseSha256Sums returns null when the asset is absent", () => {
  assert.equal(parseSha256Sums("abc  other", "yt-dlp.exe"), null);
});
