// Dornenranken mit Rosen als SVG-Bild: geflochtene Ranken, spitze Dornen, Rosen mit Blättern.
// Große Ansichten bekommen ein Intro (Ranken wachsen, Rosen erblühen) und sanftes Wiegen der Rosen.
import { rng, f } from './membrane';

export const THORNS = {
  rose: { name: 'Rosendornen', vine: '#2b1610', vineLight: '#6b3a26', thorn: '#170b07', rose: ['#ff4a5c', '#b0101f', '#3a0207'], leaf: ['#4f8a34', '#1f3d14'], glow: '#ff2a3a' },
  briar: { name: 'Dornröschen', vine: '#2c4219', vineLight: '#7aa043', thorn: '#1a2a0e', rose: ['#ffd0e4', '#f472b6', '#831843'], leaf: ['#6fae46', '#2a5418'], glow: '#f472b6' },
  night: { name: 'Schattendornen', vine: '#160c22', vineLight: '#4a2c6b', thorn: '#0a0412', rose: ['#e2c2ff', '#7e22ce', '#1e0533'], leaf: ['#3b3f58', '#141625'], glow: '#a855f7' },
};

// Linienzug -> geglättete Kurve (quadratische Bézier über die Mittelpunkte)
function smooth(pts, closed) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = closed ? `M${f(mid(pts[n - 1], pts[0])[0])} ${f(mid(pts[n - 1], pts[0])[1])}` : `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  if (!closed) d += `L${f(pts[n - 1][0])} ${f(pts[n - 1][1])}`;
  return d + (closed ? 'Z' : '');
}

// Dornen entlang einer Ranke, abwechselnd nach links/rechts, leicht in Wuchsrichtung geneigt
function thornsAlong(pts, every, size, rand, p) {
  let out = '';
  for (let i = 2; i < pts.length - 2; i += every) {
    const [x, y] = pts[i];
    let tx = pts[i + 1][0] - pts[i - 1][0];
    let ty = pts[i + 1][1] - pts[i - 1][1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const side = (i / every) % 2 ? 1 : -1;
    const nx = -ty * side;
    const ny = tx * side;
    const len = size * (0.8 + rand() * 0.6);
    const bw = size * 0.32;
    const tip = [x + nx * len + tx * len * 0.45, y + ny * len + ty * len * 0.45];
    out += `<path d="M${f(x - tx * bw)} ${f(y - ty * bw)}Q${f(x + nx * len * 0.35)} ${f(y + ny * len * 0.35)} ${f(tip[0])} ${f(tip[1])}L${f(x + tx * bw)} ${f(y + ty * bw)}Z"/>`;
  }
  return `<g class="t" fill="${p.thorn}" stroke="${p.vineLight}" stroke-width=".5">${out}</g>`;
}

function leaf(x, y, s, a) {
  return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})" fill="url(#lf)" d="M0 0Q${f(s * 0.5)} ${f(-s * 0.42)} ${f(s * 1.15)} 0Q${f(s * 0.5)} ${f(s * 0.42)} 0 0Z"/><path transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})" stroke="#000" stroke-opacity=".3" stroke-width="${f(s * 0.06)}" d="M0 0L${f(s)} 0"/>`;
}

// Rose: zwei Blütenblatt-Lagen + eingerollte Mitte, darunter zwei Blätter
function rose(x, y, s, rot, i) {
  let petals = '';
  for (let k = 0; k < 5; k++) {
    const a = rot + k * 72;
    petals += `<ellipse cx="${f(x + Math.cos((a * Math.PI) / 180) * s * 0.42)}" cy="${f(y + Math.sin((a * Math.PI) / 180) * s * 0.42)}" rx="${f(s * 0.52)}" ry="${f(s * 0.42)}" transform="rotate(${f(a)} ${f(x + Math.cos((a * Math.PI) / 180) * s * 0.42)} ${f(y + Math.sin((a * Math.PI) / 180) * s * 0.42)})" fill="url(#rp)"/>`;
  }
  for (let k = 0; k < 4; k++) {
    const a = rot + 36 + k * 90;
    petals += `<ellipse cx="${f(x + Math.cos((a * Math.PI) / 180) * s * 0.2)}" cy="${f(y + Math.sin((a * Math.PI) / 180) * s * 0.2)}" rx="${f(s * 0.36)}" ry="${f(s * 0.3)}" fill="url(#rp)" stroke="url(#rd)" stroke-width="${f(s * 0.05)}"/>`;
  }
  const c = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.26)}" fill="url(#rd)"/><path fill="none" stroke="#000" stroke-opacity=".35" stroke-width="${f(s * 0.06)}" d="M${f(x - s * 0.12)} ${f(y)}a${f(s * 0.12)} ${f(s * 0.12)} 0 1 1 ${f(s * 0.16)} ${f(s * 0.1)}"/>`;
  const leaves = leaf(x, y, s * 1.25, rot + 140) + leaf(x, y, s * 1.1, rot + 230);
  return `<g class="r" style="animation-delay:${f(1.1 + i * 0.15)}s,-${f(i * 0.9)}s">${leaves}${petals}${c}</g>`;
}

function svg(w, h, p, body, animate) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="rp" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${p.rose[0]}"/><stop offset=".6" stop-color="${p.rose[1]}"/><stop offset="1" stop-color="${p.rose[2]}"/></radialGradient>
<radialGradient id="rd" cx="40%" cy="35%"><stop offset="0" stop-color="${p.rose[1]}"/><stop offset="1" stop-color="${p.rose[2]}"/></radialGradient>
<linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.leaf[0]}"/><stop offset="1" stop-color="${p.leaf[1]}"/></linearGradient>
<filter id="lit" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>
<feSpecularLighting in="b" surfaceScale="2.5" specularConstant=".8" specularExponent="20" lighting-color="#fff" result="s"><fePointLight x="${f(w * 0.3)}" y="${f(-h * 0.3)}" z="${f(Math.max(w, h) * 0.7)}"/></feSpecularLighting>
<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".55" k4="0" result="lit"/>
<feDropShadow in="lit" dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity=".6"/>
</filter>
</defs>
<style>
.v{stroke-dasharray:100;${animate ? 'animation:grow 1.6s cubic-bezier(.3,.7,.3,1) both' : ''}}
.t{${animate ? 'animation:pop .5s ease-out 1s both' : ''}}
.r{transform-box:fill-box;transform-origin:center;${animate ? 'animation:bloom .7s cubic-bezier(.2,1.5,.4,1) both,sway 4s ease-in-out infinite' : ''}}
@keyframes grow{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes pop{from{opacity:0}}
@keyframes bloom{from{transform:scale(0) rotate(-90deg)}}
@keyframes sway{50%{transform:rotate(8deg) scale(1.06)}}
</style>
<g filter="url(#lit)">${body}</g>
</svg>`;
}

// eine Ranke = dunkle Kontur + hellere Füllung, beide "wachsen" (pathLength 100)
function vine(d, width, p) {
  return `<path class="v" pathLength="100" d="${d}" fill="none" stroke="${p.thorn}" stroke-width="${f(width + 2)}" stroke-linecap="round" stroke-linejoin="round"/><path class="v" pathLength="100" d="${d}" fill="none" stroke="${p.vine}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function ring(p, animate, seed) {
  const rand = rng(seed);
  const C = 100;
  let vines = '';
  let thorns = '';
  const all = [];
  for (let v = 0; v < 3; v++) {
    const ph = v * 2.1;
    const pts = [];
    for (let i = 0; i < 150; i++) {
      const t = (i / 150) * Math.PI * 2;
      const r = 75 + 8 * Math.sin(3 * t + ph) + 2.5 * Math.sin(7 * t + ph * 1.7);
      pts.push([C + Math.cos(t + v * 0.4) * r, C + Math.sin(t + v * 0.4) * r]);
    }
    all.push(pts);
    vines += vine(smooth(pts, true), 5.6 - v * 0.9, p);
    thorns += thornsAlong(pts, 6, 10, rand, p);
  }
  let roses = '';
  [-2.35, -0.5, 0.75, 2.1].forEach((a, i) => {
    roses += rose(C + Math.cos(a) * 77, C + Math.sin(a) * 77, i === 0 ? 20 : 14 + rand() * 3, rand() * 360, i);
  });
  return svg(200, 200, p, vines + thorns + roses, animate);
}

function plate(p, animate, seed) {
  const rand = rng(seed);
  let body = '';
  for (let v = 0; v < 2; v++) {
    const ph = v * 2.6;
    const pts = [];
    for (let x = -10; x <= 410; x += 5) pts.push([x, 50 + 24 * Math.sin(x / 42 + ph) + 6 * Math.sin(x / 13 + ph * 2)]);
    body += vine(smooth(pts, false), 6.5 - v * 1.5, p) + thornsAlong(pts, 3, 12, rand, p);
  }
  [70, 215, 345].forEach((x, i) => (body += rose(x, 50 + 24 * Math.sin(x / 42), 15 + rand() * 4, rand() * 360, i)));
  return svg(400, 100, p, body, animate);
}

// Profil-Effekt: Ranken laufen als Rahmen um die Karte, Rosen in den Ecken
function card(p, animate, seed) {
  const rand = rng(seed);
  const W = 340;
  const H = 540;
  const per = 2 * (W + H);
  const at = (s) => {
    s = ((s % per) + per) % per;
    if (s < W) return [s, 0, 0, 1];
    if (s < W + H) return [W, s - W, -1, 0];
    if (s < 2 * W + H) return [W - (s - W - H), H, 0, -1];
    return [0, H - (s - 2 * W - H), 1, 0];
  };
  let body = '';
  for (let v = 0; v < 2; v++) {
    const ph = v * 2.3;
    const pts = [];
    for (let s = 0; s < per; s += 6) {
      const [x, y, nx, ny] = at(s);
      const off = 16 + 11 * Math.sin(s / 34 + ph) + 4 * Math.sin(s / 11 + ph);
      pts.push([x + nx * off, y + ny * off]);
    }
    body += vine(smooth(pts, true), 7 - v * 1.5, p) + thornsAlong(pts, 3, 13, rand, p);
  }
  [[30, 30, 24], [W - 34, 40, 20], [26, H - 36, 20], [W - 30, H - 30, 26], [W - 22, 250, 15], [20, 330, 15]].forEach(([x, y, s], i) => (body += rose(x, y, s, rand() * 360, i)));
  return svg(W, H, p, body, animate);
}

const cache = new Map();
export function thornArt(variant, kind, animate = true) {
  const key = variant + kind + animate;
  if (!cache.has(key)) {
    const p = THORNS[variant] || THORNS.rose;
    const seed = { ring: 5, plate: 9, card: 13 }[kind] + Object.keys(THORNS).indexOf(variant) * 31;
    cache.set(key, 'data:image/svg+xml,' + encodeURIComponent({ ring, plate, card }[kind](p, animate, seed)));
  }
  return cache.get(key);
}
