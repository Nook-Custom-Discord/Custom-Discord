// Erzeugt build/icon.png (1024x1024) ohne externe Abhängigkeiten
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const N = Number(process.argv[2]) || 1024, SS = 3;
const K = N / 1024; // Skalierung
const buf = Buffer.alloc(N * N * 4);
const lerp = (a, b, t) => a + (b - a) * t;
const c1 = [255, 122, 69], c2 = [255, 190, 80];
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdArch(x, y) {
  // Torbogen: Kreis oben + Rechteck unten, als dicke Linie
  const cx = 512, top = 330, r = 190, bottom = 760, th = 64;
  let d;
  if (y < top) d = Math.abs(Math.hypot(x - cx, y - top) - r);
  else d = Math.min(Math.abs(x - (cx - r)), Math.abs(x - (cx + r)));
  if (y > bottom) d = Math.hypot(Math.min(Math.abs(x - (cx - r)), Math.abs(x - (cx + r))), y - bottom);
  return d - th / 2;
}
for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const x = (px + (sx + 0.5) / SS) / K, y = (py + (sy + 0.5) / SS) / K;
    const inBg = sdRoundRect(x, y, 512, 512, 440, 440, 200) < 0;
    if (!inBg) continue;
    const t = (x + y) / 2048;
    let col = [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
    const dot = Math.hypot(x - 512, y - 560) - 62;
    if (sdArch(x, y) < 0 || dot < 0) col = [255, 250, 245];
    r += col[0]; g += col[1]; b += col[2]; a += 255;
  }
  const n = SS * SS, i = (py * N + px) * 4;
  if (a) { buf[i] = r / (a / 255); buf[i + 1] = g / (a / 255); buf[i + 2] = b / (a / 255); }
  buf[i + 3] = a / n;
}
// PNG schreiben
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; buf.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(process.argv[3] || path.join(__dirname, 'icon.png'), png);
console.log('icon.png geschrieben', png.length, 'Bytes');
