// scripts/fetch-pose-model.cjs
// Downloads the MediaPipe pose model used by the "Absolute Cinema" detector
// into models/ (gitignored). Runs before `npm run dev` and before packaging,
// so the installer ships the model instead of downloading it on first launch.
//
// Same idea as fetch-ytdlp.cjs: the URL is versioned and the SHA-256 pinned,
// so a tampered or truncated download fails loudly instead of being bundled.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const MODEL_SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
const MODEL_FILE = path.join(__dirname, "..", "models", "pose_landmarker_lite.task");

// --optional: dev mode. Pose detection is a side feature, so a failed download
// (offline laptop) only warns. Packaging omits it and fails the build instead.
const optional = process.argv.includes("--optional");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  if (fs.existsSync(MODEL_FILE) && sha256(fs.readFileSync(MODEL_FILE)) === MODEL_SHA256) {
    console.log("[fetch-pose-model] model already present and verified");
    return;
  }
  console.log("[fetch-pose-model] downloading pose model");
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256(buf);
  if (actual !== MODEL_SHA256) throw new Error(`checksum mismatch: ${actual} != ${MODEL_SHA256}`);
  fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
  fs.writeFileSync(MODEL_FILE, buf);
  console.log(`[fetch-pose-model] wrote ${MODEL_FILE}`);
}

main().catch((err) => {
  if (optional) {
    console.warn(`[fetch-pose-model] ${err.message} (pose detection disabled until it succeeds)`);
    return;
  }
  console.error(`[fetch-pose-model] ${err.message}`);
  process.exit(1);
});
