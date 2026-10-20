import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTS = new Set(["png", "jpg", "gif", "webp"]);
const VIDEO_EXTS = new Set(["mp4", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg"]);
export const UPLOAD_NAME_RE = /^[0-9a-f]{12}-[a-z0-9-]+\.[a-z0-9]+$/;

function extOf(name: string) {
  return path.extname(name).slice(1).toLowerCase();
}

function magicMatches(ext: string, head: Buffer) {
  if (ext === "png") return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (ext === "jpg") return head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (ext === "gif") return head.subarray(0, 4).toString() === "GIF8";
  if (ext === "webp") return head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP";
  if (ext === "mp4") return head.subarray(4, 8).toString() === "ftyp";
  if (ext === "webm") return head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (ext === "mp3") return head.subarray(0, 3).toString() === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  if (ext === "wav") return head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WAVE";
  if (ext === "ogg") return head.subarray(0, 4).toString() === "OggS";
  return false;
}

export function validateUpload(
  name: string,
  head: Buffer,
  size: number
): { ok: true; ext: string; kind: "image" | "video" | "audio" } | { ok: false; error: "type" | "size" } {
  const ext = extOf(name);
  const kind = IMAGE_EXTS.has(ext) ? "image" : VIDEO_EXTS.has(ext) ? "video" : AUDIO_EXTS.has(ext) ? "audio" : null;
  if (!kind || !magicMatches(ext, head)) return { ok: false, error: "type" };
  const limit = kind === "image" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (size > limit) return { ok: false, error: "size" };
  return { ok: true, ext, kind };
}

export function safeAssetName(original: string, ext: string): string {
  const base =
    path
      .basename(original, path.extname(original))
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file";
  return `${crypto.randomBytes(6).toString("hex")}-${base}.${ext}`;
}

export function cleanupUnusedUploads(dir: string, referencedUrls: Set<string>): string[] {
  const deleted: string[] = [];
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!UPLOAD_NAME_RE.test(name) || referencedUrls.has(`/user-assets/${name}`)) continue;
    fs.rmSync(path.join(dir, name), { force: true });
    deleted.push(name);
  }
  return deleted;
}
