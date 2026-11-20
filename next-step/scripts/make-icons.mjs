#!/usr/bin/env node
// Draws Next Step's icons with no dependencies: an amber tile with a dark
// envelope, sharing Context Save's look. Run once after
// changing the design: `node scripts/make-icons.mjs`. Writes src-tauri/icons/.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const AMBER = [242, 181, 68];
const INK = [26, 31, 41];
const OUT = new URL("../src-tauri/icons/", import.meta.url);

// Signed distance to a rounded box centred at (cx, cy) with half-size (hw, hh) and radius r.
const box = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const cover = (d, px) => Math.min(Math.max(0.5 - d / px, 0), 1);

/** One pixel of the design in unit space (0..1). Returns [r, g, b, a]. */
function shade(u, v, px, { tile }) {
  const layers = [];
  if (tile) layers.push([AMBER, cover(box(u, v, 0.5, 0.5, 0.46, 0.46, 0.2), px)]);
  const ink = tile ? INK : AMBER;
  // Envelope outline.
  const outer = box(u, v, 0.5, 0.5, 0.3, 0.21, 0.05);
  const inner = box(u, v, 0.5, 0.5, 0.235, 0.145, 0.02);
  layers.push([ink, cover(Math.max(outer, -inner), px)]);
  // Flap: a V from the top corners, drawn as a thick line.
  const seg = (ax, ay, bx, by) => {
    const t = Math.min(Math.max(((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0), 1);
    return Math.hypot(u - (ax + t * (bx - ax)), v - (ay + t * (by - ay))) - 0.035;
  };
  layers.push([ink, cover(Math.min(seg(0.3, 0.36, 0.5, 0.52), seg(0.7, 0.36, 0.5, 0.52)), px)]);
  let rgb = [0, 0, 0];
  let a = 0;
  for (const [c, alpha] of layers) {
    // "Over" compositing.
    rgb = rgb.map((ch, i) => (a * (1 - alpha) * ch + alpha * c[i]) / Math.max(alpha + a * (1 - alpha), 1e-6));
    a = alpha + a * (1 - alpha);
  }
  return [...rgb.map(Math.round), Math.round(a * 255)];
}

function png(size, opts) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for clean edges at small sizes.
      const acc = [0, 0, 0, 0];
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const p = shade((x + ox) / size, (y + oy) / size, 1 / size, opts);
        acc[0] += p[0] * p[3]; acc[1] += p[1] * p[3]; acc[2] += p[2] * p[3]; acc[3] += p[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const a = acc[3] / 4;
      raw[o] = a ? Math.round(acc[0] / acc[3]) : 0;
      raw[o + 1] = a ? Math.round(acc[1] / acc[3]) : 0;
      raw[o + 2] = a ? Math.round(acc[2] / acc[3]) : 0;
      raw[o + 3] = Math.round(a);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An .ico holding PNG images (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, data], i) => {
    const e = 6 + i * 16;
    header[e] = size >= 256 ? 0 : size;
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(([, d]) => d)]);
}

mkdirSync(OUT, { recursive: true });
const app = (s) => png(s, { tile: true });
writeFileSync(new URL("32x32.png", OUT), app(32));
writeFileSync(new URL("128x128.png", OUT), app(128));
writeFileSync(new URL("128x128@2x.png", OUT), app(256));
writeFileSync(new URL("icon.png", OUT), app(512));
writeFileSync(new URL("icon.ico", OUT), ico([16, 24, 32, 48, 64, 256].map((s) => [s, app(s)])));
writeFileSync(new URL("tray.png", OUT), png(32, { tile: true }));
console.log("Icons written to src-tauri/icons/");
