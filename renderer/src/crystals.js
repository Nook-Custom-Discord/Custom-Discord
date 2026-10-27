// Facettierte Kristalle als SVG-Bild: Splitter mit hellen/dunklen Facetten, Glanzkanten und funkelnden Sternen.
// Animation: einzelne Facetten blitzen nacheinander auf, Sterne funkeln.
import { rng, f } from './membrane';

export const CRYSTALS = {
  amethyst: { name: 'Amethyst', a: '#f3e8ff', b: '#a855f7', c: '#3b0d6e', glow: '#c084fc' },
  ice: { name: 'Eiskristall', a: '#f0fbff', b: '#67c6f5', c: '#0c3a5c', glow: '#7dd3fc' },
  ruby: { name: 'Rubin', a: '#ffe4e8', b: '#f43f5e', c: '#5c0b16', glow: '#fb7185' },
};

// ein Splitter: Basis bei (x,y), zeigt in Richtung ang (Grad), zwei Facetten + Glanzkante + Blitz-Facette
function shard(x, y, ang, len, w, i) {
  const r = (ang * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const nx = -dy;
  const ny = dx;
  const P = (along, side) => `${f(x + dx * along + nx * side)} ${f(y + dy * along + ny * side)}`;
  const base = P(0, 0);
  const tip = P(len, 0);
  const l1 = P(-w * 0.15, -w / 2);
  const l2 = P(len * 0.72, -w / 2);
  const r1 = P(-w * 0.15, w / 2);
  const r2 = P(len * 0.72, w / 2);
  return `<g><path fill="url(#fa)" d="M${l1}L${l2}L${tip}L${base}Z"/><path fill="url(#fb)" d="M${base}L${tip}L${r2}L${r1}Z"/><path fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="${f(Math.max(0.6, w * 0.06))}" d="M${base}L${tip}"/><path class="g" style="animation-delay:-${f((i * 0.53) % 4)}s" fill="#fff" d="M${l1}L${l2}L${tip}L${base}Z"/></g>`;
}

function star(x, y, s, i) {
  return `<path class="s" style="animation-delay:-${f((i * 0.61) % 2.6)}s" fill="#fff" d="M${f(x)} ${f(y - s)}L${f(x + s * 0.22)} ${f(y - s * 0.22)}L${f(x + s)} ${f(y)}L${f(x + s * 0.22)} ${f(y + s * 0.22)}L${f(x)} ${f(y + s)}L${f(x - s * 0.22)} ${f(y + s * 0.22)}L${f(x - s)} ${f(y)}L${f(x - s * 0.22)} ${f(y - s * 0.22)}Z"/>`;
}

function svg(w, h, p, body, stars, animate) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="fa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset=".55" stop-color="${p.b}"/><stop offset="1" stop-color="${p.c}"/></linearGradient>
<linearGradient id="fb" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.b}"/><stop offset="1" stop-color="${p.c}"/></linearGradient>
<filter id="gl" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="${p.glow}" flood-opacity=".75"/></filter>
</defs>
<style>
.g{opacity:0;${animate ? 'animation:glint 4s ease-in-out infinite' : ''}}
.s{transform-box:fill-box;transform-origin:center;${animate ? 'animation:tw 2.6s ease-in-out infinite' : 'opacity:.8'}}
@keyframes glint{0%,80%,100%{opacity:0}88%{opacity:.75}}
@keyframes tw{0%,100%{transform:scale(.3) rotate(0);opacity:.3}50%{transform:scale(1) rotate(45deg);opacity:1}}
</style>
<g filter="url(#gl)">${body}</g>
${stars}
</svg>`;
}

function ring(p, animate, seed) {
  const rand = rng(seed);
  const C = 100;
  const shards = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * 360 + (rand() - 0.5) * 12;
    const long = i % 3 === 0;
    shards.push({ a, len: long ? 26 + rand() * 10 : 12 + rand() * 9, w: long ? 12 + rand() * 3 : 8 + rand() * 4, r0: 62 + rand() * 4, tilt: (rand() - 0.5) * 24 });
  }
  shards.sort((x, y) => y.len - x.len);
  let body = `<circle cx="${C}" cy="${C}" r="69" fill="none" stroke="${p.b}" stroke-width="2.4"/><circle cx="${C}" cy="${C}" r="66.5" fill="none" stroke="${p.a}" stroke-opacity=".6" stroke-width=".8"/>`;
  shards.forEach((s, i) => {
    const r = (s.a * Math.PI) / 180;
    body += shard(C + Math.cos(r) * s.r0, C + Math.sin(r) * s.r0, s.a + s.tilt, s.len, s.w, i);
  });
  let stars = '';
  shards.slice(0, 6).forEach((s, i) => {
    const r = ((s.a + s.tilt * 0.4) * Math.PI) / 180;
    stars += star(C + Math.cos(r) * (s.r0 + s.len + 2), C + Math.sin(r) * (s.r0 + s.len + 2), 4 + rand() * 3, i);
  });
  return svg(200, 200, p, body, stars, animate);
}

function plate(p, animate, seed) {
  const rand = rng(seed);
  let body = '';
  let stars = '';
  for (let x = -6, i = 0; x < 410; x += 13 + rand() * 12, i++) {
    const fromTop = i % 4 === 3;
    const len = fromTop ? 18 + rand() * 18 : 30 + rand() * 50;
    body += shard(x, fromTop ? -4 : 104, (fromTop ? 90 : -90) + (rand() - 0.5) * 50, len, 9 + rand() * 9, i);
    if (i % 5 === 1) stars += star(x + 8, 20 + rand() * 60, 5 + rand() * 3, i);
  }
  return svg(400, 100, p, body, stars, animate);
}

// Profil-Effekt: Kristallhaufen an Boden und Ecken, Mitte bleibt frei
function card(p, animate, seed) {
  const rand = rng(seed);
  const W = 340;
  const H = 540;
  let body = '';
  let stars = '';
  let i = 0;
  const cluster = (cx, cy, dir, n, size) => {
    for (let k = 0; k < n; k++, i++) body += shard(cx + (rand() - 0.5) * size * 0.9, cy + (rand() - 0.5) * size * 0.3, dir + (rand() - 0.5) * 70, size * (0.45 + rand() * 0.75), size * (0.12 + rand() * 0.1), i);
  };
  for (let x = -10; x < W + 20; x += 34) cluster(x, H + 6, -90, 3, 70 + rand() * 50);
  cluster(0, 0, 45, 6, 90);
  cluster(W, 0, 135, 6, 90);
  cluster(0, 300, 0, 4, 60);
  cluster(W, 380, 180, 4, 60);
  for (let k = 0; k < 14; k++) {
    const edge = k % 4;
    const x = edge === 1 ? W - rand() * 50 : edge === 3 ? rand() * 50 : rand() * W;
    const y = edge === 0 ? rand() * 120 : edge === 2 ? H - rand() * 130 : rand() * H;
    stars += star(x, y, 4 + rand() * 5, k);
  }
  return svg(W, H, p, body, stars, animate);
}

const cache = new Map();
export function crystalArt(variant, kind, animate = true) {
  const key = variant + kind + animate;
  if (!cache.has(key)) {
    const p = CRYSTALS[variant] || CRYSTALS.amethyst;
    const seed = { ring: 3, plate: 17, card: 29 }[kind] + Object.keys(CRYSTALS).indexOf(variant) * 47;
    cache.set(key, 'data:image/svg+xml,' + encodeURIComponent({ ring, plate, card }[kind](p, animate, seed)));
  }
  return cache.get(key);
}
