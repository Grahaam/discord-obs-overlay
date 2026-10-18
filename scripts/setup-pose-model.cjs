"use strict";
// Downloads the MediaPipe pose model used by the "Absolute Cinema" detector.
// Non-fatal: the rest of the app works without it.
const fs = require("fs");
const path = require("path");
const https = require("https");

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const MODELS_DIR = path.resolve(__dirname, "..", "models");
const MODEL_FILE = path.join(MODELS_DIR, "pose_landmarker_lite.task");

if (fs.existsSync(MODEL_FILE)) {
  console.log("[Setup] Pose model already present.");
  process.exit(0);
}

fs.mkdirSync(MODELS_DIR, { recursive: true });
const tmpFile = MODEL_FILE + ".tmp";

console.log("[Setup] Downloading pose model...");
https
  .get(MODEL_URL, (res) => {
    if (res.statusCode !== 200) {
      console.warn(`[Setup] Pose model download failed (HTTP ${res.statusCode}) — pose detection disabled.`);
      res.resume();
      return;
    }
    const out = fs.createWriteStream(tmpFile);
    res.pipe(out);
    out.on("finish", () => {
      out.close(() => {
        fs.renameSync(tmpFile, MODEL_FILE);
        console.log("[Setup] Pose model ready.");
      });
    });
  })
  .on("error", (err) => {
    fs.rmSync(tmpFile, { force: true });
    console.warn("[Setup] Pose model download failed (non-fatal):", err.message);
  });
