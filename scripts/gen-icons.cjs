'use strict';

/**
 * gen-icons.cjs
 *
 * Generates two PNG icon files using only Node.js built-ins (no image deps):
 *   electron/assets/tray.png  — 32×32  (tray icon for Electron)
 *   electron/assets/icon.png  — 512×512 (app/installer icon for electron-builder)
 *
 * Design: Discord-blurple (#5865F2) background with a centered white right-pointing
 * play triangle occupying ~45% of the canvas width/height. Crisp edges, no anti-aliasing.
 *
 * PNG encoding: 8-bit RGBA (color type 6), raw scanlines each prefixed with filter
 * byte 0x00, compressed with zlib.deflateSync (zlib stream = RFC 1950 header + deflate
 * + Adler-32). CRC32 is implemented table-based (poly 0xEDB88320).
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 (table-based, RFC 3720 / PNG spec) ──────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk builder ─────────────────────────────────────────────────────────

/**
 * Builds a single PNG chunk: [length(4)] [type(4)] [data(n)] [crc(4)]
 * CRC covers type + data.
 */
function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const dataBytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const length    = Buffer.alloc(4);
  length.writeUInt32BE(dataBytes.length, 0);

  const crcInput = Buffer.concat([typeBytes, dataBytes]);
  const crcValue = crc32(crcInput);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crcValue, 0);

  return Buffer.concat([length, typeBytes, dataBytes, crcBytes]);
}

// ── IHDR builder ──────────────────────────────────────────────────────────────

function makeIHDR(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width,  0);
  data.writeUInt32BE(height, 4);
  data[8]  = 8;  // bit depth
  data[9]  = 6;  // color type: RGBA
  data[10] = 0;  // compression method
  data[11] = 0;  // filter method
  data[12] = 0;  // interlace method
  return makeChunk('IHDR', data);
}

// ── IDAT builder ──────────────────────────────────────────────────────────────

/**
 * pixels: Uint8Array of length width*height*4 (RGBA, row-major, top-left origin)
 * Returns a single IDAT chunk containing the zlib-compressed filtered scanlines.
 */
function makeIDAT(width, height, pixels) {
  // Build raw scanlines: 1 filter byte (0x00 = None) + width*4 bytes per row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0x00; // filter type: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowStart + 1 + x * 4;
      raw[dstIdx + 0] = pixels[srcIdx + 0]; // R
      raw[dstIdx + 1] = pixels[srcIdx + 1]; // G
      raw[dstIdx + 2] = pixels[srcIdx + 2]; // B
      raw[dstIdx + 3] = pixels[srcIdx + 3]; // A
    }
  }
  // zlib.deflateSync produces RFC 1950 zlib stream (header + deflate + Adler-32)
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return makeChunk('IDAT', compressed);
}

// ── Full PNG assembler ────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function encodePNG(width, height, pixels) {
  return Buffer.concat([
    PNG_SIGNATURE,
    makeIHDR(width, height),
    makeIDAT(width, height, pixels),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel drawing: blurple background + white play triangle ──────────────────

/**
 * Fills `pixels` (RGBA flat array, width×height) with:
 *   - Background: #5865F2 (Discord blurple), fully opaque
 *   - Play triangle: white, pointing right, centered, ~45% of canvas
 *
 * Triangle geometry (normalized coords, scale-independent):
 *   The triangle occupies a bounding box of 45% of width and 45% of height,
 *   centered in the canvas.
 *
 *   Left edge:   x = cx - halfW
 *   Right apex:  x = cx + halfW
 *   Top edge:    y = cy - halfH
 *   Bottom edge: y = cy + halfH
 *
 *   A pixel (px, py) is inside the triangle when:
 *     1. px >= left
 *     2. px <= right
 *     3. The horizontal half-width at row py (linear interpolation from 0 at
 *        right apex to halfH at left edge) is >= (px - cx):
 *           span_at_x = halfH * (right - px) / (right - left)
 *           => py must be within ±span_at_x of cy
 *
 *   Equivalently (rearranged):
 *     |py - cy| / halfH <= (right - px) / (right - left)
 */
function drawIcon(width, height) {
  const pixels = new Uint8Array(width * height * 4);

  // Background color: #5865F2
  const BG_R = 0x58, BG_G = 0x65, BG_B = 0xF2;

  const cx = width  / 2;
  const cy = height / 2;
  const halfW = width  * 0.225; // 45% total width → ±22.5% from center
  const halfH = height * 0.225;

  const left  = cx - halfW;
  const right = cx + halfW;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Default: blurple background
      pixels[idx + 0] = BG_R;
      pixels[idx + 1] = BG_G;
      pixels[idx + 2] = BG_B;
      pixels[idx + 3] = 0xFF;

      // Triangle test
      if (x >= left && x <= right) {
        // At this x, the triangle's allowed vertical span narrows linearly from
        // ±halfH at x=left to 0 at x=right.
        const span = halfH * (right - x) / (right - left);
        if (Math.abs(y - cy) <= span) {
          pixels[idx + 0] = 0xFF; // R
          pixels[idx + 1] = 0xFF; // G
          pixels[idx + 2] = 0xFF; // B
          pixels[idx + 3] = 0xFF; // A
        }
      }
    }
  }

  return pixels;
}

// ── PNG verification (round-trip) ─────────────────────────────────────────────

/**
 * Parses the written PNG bytes, verifies:
 *   - 8-byte signature
 *   - Each chunk's CRC
 *   - IHDR width/height match expected
 *   - IDAT zlib-decompresses to exactly height*(1+width*4) bytes
 * Throws on any failure.
 */
function verifyPNG(buf, expectedWidth, expectedHeight) {
  // Signature
  const SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error(`Bad PNG signature byte at offset ${i}`);
  }

  let offset = 8;
  let ihdrSeen = false;
  let idatData = null;

  while (offset < buf.length) {
    const length   = buf.readUInt32BE(offset);       offset += 4;
    const typeBytes = buf.slice(offset, offset + 4); offset += 4;
    const type     = typeBytes.toString('ascii');
    const data     = buf.slice(offset, offset + length); offset += length;
    const storedCRC = buf.readUInt32BE(offset);      offset += 4;

    // Verify CRC
    const computedCRC = crc32(Buffer.concat([typeBytes, data]));
    if (computedCRC !== storedCRC) {
      throw new Error(`CRC mismatch in chunk '${type}': stored 0x${storedCRC.toString(16)}, computed 0x${computedCRC.toString(16)}`);
    }

    if (type === 'IHDR') {
      ihdrSeen = true;
      const w = data.readUInt32BE(0);
      const h = data.readUInt32BE(4);
      if (w !== expectedWidth)  throw new Error(`IHDR width ${w} != expected ${expectedWidth}`);
      if (h !== expectedHeight) throw new Error(`IHDR height ${h} != expected ${expectedHeight}`);
    }

    if (type === 'IDAT') {
      idatData = idatData ? Buffer.concat([idatData, data]) : data;
    }

    if (type === 'IEND') break;
  }

  if (!ihdrSeen)   throw new Error('Missing IHDR chunk');
  if (!idatData)   throw new Error('Missing IDAT chunk');

  // Decompress IDAT and check raw size
  const raw = zlib.inflateSync(idatData);
  const expectedRaw = expectedHeight * (1 + expectedWidth * 4);
  if (raw.length !== expectedRaw) {
    throw new Error(`Decompressed IDAT size ${raw.length} != expected ${expectedRaw}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function generateIcon(outPath, size) {
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });

  const pixels = drawIcon(size, size);
  const pngBuf = encodePNG(size, size, pixels);

  // Self-verify before writing
  verifyPNG(pngBuf, size, size);

  fs.writeFileSync(outPath, pngBuf);
  console.log(`Wrote ${outPath}  (${size}×${size}, ${pngBuf.length} bytes)`);
}

const root = path.resolve(__dirname, '..');

generateIcon(path.join(root, 'electron', 'assets', 'tray.png'),  32);
generateIcon(path.join(root, 'electron', 'assets', 'icon.png'), 512);

console.log('Done. All icons verified (signature, CRCs, IDAT round-trip).');
