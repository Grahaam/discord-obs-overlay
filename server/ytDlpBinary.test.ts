import test from "node:test";
import assert from "node:assert";
import { standaloneBinaryName } from "./ytDlpBinary.js";

test("standaloneBinaryName maps platforms to standalone asset names", () => {
  assert.equal(standaloneBinaryName("win32"), "yt-dlp.exe");
  assert.equal(standaloneBinaryName("darwin"), "yt-dlp_macos");
  assert.equal(standaloneBinaryName("linux"), "yt-dlp_linux");
});

test("standaloneBinaryName throws on unsupported platform", () => {
  assert.throws(() => standaloneBinaryName("sunos"), /unsupported platform/i);
});
