// scripts/fetch-pose-model.cjs
// Downloads the MediaPipe models used by the pose detector (body + hands)
// into models/ (gitignored). Runs before `npm run dev` and before packaging,
// so the installer ships the models instead of downloading them on first launch.
//
// Same idea as fetch-ytdlp.cjs: the URLs are versioned and the SHA-256 pinned,
// so a tampered or truncated download fails loudly instead of being bundled.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MODELS_DIR = path.join(__dirname, "..", "models");
const MODELS = [
  {
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
    file: "pose_landmarker_lite.task",
  },
  {
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
    file: "hand_landmarker.task",
  },
];

// --optional: dev mode. Pose detection is a side feature, so a failed download
// (offline laptop) only warns. Packaging omits it and fails the build instead.
const optional = process.argv.includes("--optional");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function fetchModel({ url, sha256: expected, file }) {
  const target = path.join(MODELS_DIR, file);
  if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === expected) {
    console.log(`[fetch-pose-model] ${file} already present and verified`);
    return;
  }
  console.log(`[fetch-pose-model] downloading ${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file}: download failed (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256(buf);
  if (actual !== expected) throw new Error(`${file}: checksum mismatch: ${actual} != ${expected}`);
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(target, buf);
  console.log(`[fetch-pose-model] wrote ${target}`);
}

async function main() {
  const errors = [];
  for (const model of MODELS) {
    try {
      await fetchModel(model);
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

main().catch((err) => {
  if (optional) {
    console.warn(`[fetch-pose-model] ${err.message} (pose detection disabled until it succeeds)`);
    return;
  }
  console.error(`[fetch-pose-model] ${err.message}`);
  process.exit(1);
});
