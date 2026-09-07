/**
 * PWA icon generator (PNG) with no external dependencies:
 * a minimalist "mini crossword" — a plus of white cells with a yellow center.
 * Usage: npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Minimal PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Drawing ----------
const BG = [180, 83, 9]; // paper-theme accent (#b45309)
const WHITE = [255, 255, 255];
const YELLOW = [251, 191, 36];

function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : Math.round(size * 0.22);

  const insideRounded = (x, y) => {
    if (radius === 0) return true;
    const r = radius;
    const nx = Math.min(x, size - 1 - x);
    const ny = Math.min(y, size - 1 - y);
    if (nx >= r || ny >= r) return true;
    const dx = r - nx;
    const dy = r - ny;
    return dx * dx + dy * dy <= r * r;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!insideRounded(x, y)) {
        px[i + 3] = 0;
        continue;
      }
      px[i] = BG[0];
      px[i + 1] = BG[1];
      px[i + 2] = BG[2];
      px[i + 3] = 255;
    }
  }

  const setCell = (gx, gy, color, g0, cell, gap) => {
    const x0 = Math.round(g0 + gx * cell + gap);
    const y0 = Math.round(g0 + gy * cell + gap);
    const x1 = Math.round(g0 + (gx + 1) * cell - gap);
    const y1 = Math.round(g0 + (gy + 1) * cell - gap);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * size + x) * 4;
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
        px[i + 3] = 255;
      }
    }
  };

  // 3×3 grid: a cross of white cells with a yellow center, corners are skipped.
  const [g0, g1] = maskable ? [size * 0.26, size * 0.74] : [size * 0.18, size * 0.82];
  const cell = (g1 - g0) / 3;
  const gap = size * 0.015;
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const isCross = gx === 1 || gy === 1;
      const color = gx === 1 && gy === 1 ? YELLOW : isCross ? WHITE : [255, 255, 255];
      if (!isCross) continue; // corners are not drawn to keep the plus silhouette
      setCell(gx, gy, color, g0, cell, gap);
    }
  }
  return encodePng(size, px);
}

mkdirSync(resolve(root, 'public/icons'), { recursive: true });
for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-180.png', 180, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
]) {
  writeFileSync(resolve(root, 'public/icons', name), drawIcon(size, opts));
  console.log(`✓ public/icons/${name}`);
}
