/**
 * Copies the MediaPipe runtime the pose/hand detection loads into dist/mediapipe/wasm, so the
 * packaged app doesn't need node_modules/@mediapipe (a frontend-only, Vite-bundled dependency).
 *
 * Only two of the three runtime builds are copied: FilesetResolver.forVisionTasks() loads the
 * SIMD build, or the "nosimd" one on CPUs without SIMD. The "module" build (12.9 MB) is only
 * used when forVisionTasks() is called with useModule = true, which this app never does.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm");
const DEST = path.join(__dirname, "..", "dist", "mediapipe", "wasm");
const FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

fs.mkdirSync(DEST, { recursive: true });
for (const file of FILES) {
  const from = path.join(SRC, file);
  if (!fs.existsSync(from)) {
    console.error(`[copy-mediapipe-wasm] missing ${from} (run npm install)`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(DEST, file));
}
console.log(`[copy-mediapipe-wasm] ${FILES.length} files -> ${path.relative(process.cwd(), DEST)}`);
