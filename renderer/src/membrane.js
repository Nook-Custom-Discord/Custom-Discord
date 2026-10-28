// Organische "Netz"-Kunst (Membran mit Löchern, glänzenden Zellen, Stacheln) als SVG-Bild.
// Wird einmal pro Variante erzeugt und als Daten-URL gecacht; Glanz kommt aus SVG-Lichtfiltern,
// das "Leben" aus Animationen im SVG selbst (Zellen pulsieren, die Membran wabert).

export const WEBS = {
  blood: { name: 'Karmesin-Geflecht', base: '#a3111c', dark: '#3a0207', light: '#ff7a84', glow: '#ff1f35', cell: ['#ff4255', '#b30d1d'], hole: '#1a0003' },
  frost: { name: 'Frost-Geflecht', base: '#2f8fca', dark: '#0a2740', light: '#e0f6ff', glow: '#7dd3fc', cell: ['#c7efff', '#2b86c4'], hole: '#04121f' },
  toxic: { name: 'Gift-Geflecht', base: '#4a9612', dark: '#112804', light: '#e3ff8f', glow: '#84cc16', cell: ['#bef264', '#3f8a0c'], hole: '#061002' },
  void: { name: 'Schatten-Geflecht', base: '#6b26d4', dark: '#170533', light: '#f0e3ff', glow: '#a855f7', cell: ['#dcbcff', '#7e22ce'], hole: '#0a0216' },
  gold: { name: 'Gold-Geflecht', base: '#c08d0c', dark: '#432d02', light: '#fff4c2', glow: '#fbbf24', cell: ['#ffe07a', '#b8860b'], hole: '#140d00' },
};

// deterministischer Zufall, damit jede Variante immer gleich aussieht
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const f = (n) => Math.round(n * 10) / 10;

// Löcher wachsen, bis sie fast an ihre Nachbarn stoßen (Abstand = Strangdicke) -> dichtes, dünnes Netz.
// place() liefert Mittelpunkt + Wunschradius; zu kleine Lücken werden übersprungen.
function packHoles(rand, tries, place, gap, minR = 3) {
  const holes = [];
  for (let i = 0; i < tries; i++) {
    const h = place();
    if (!h) continue;
    let free = h.r;
    for (const o of holes) {
      free = Math.min(free, Math.hypot(o.x - h.x, o.y - h.y) - o.r - gap);
      if (free < minR) break;
    }
    if (free < minR) continue;
    h.r = free;
    holes.push(h);
  }
  return holes;
}

function cellsOn(rand, n, place, holes) {
  const cells = [];
  for (let i = 0; i < n * 30 && cells.length < n; i++) {
    const c = place();
    if (!c) continue;
    // Zellen sitzen auf den Strängen, nicht in Löchern
    if (holes.some((h) => Math.hypot(h.x - c.x, h.y - c.y) < h.r + c.r * 0.35)) continue;
    if (cells.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < o.r + c.r + 2)) continue;
    cells.push(c);
  }
  return cells;
}

// animate = Membran wabert (teuer, nur für kleine Bilder), pulse = Zellen pulsieren
// backdrop = dunkler Grund hinter dem Netz (Deckkraft), damit Löcher nicht grell durchscheinen
function svg({ w, h, base, holes, cells, extra = '', p, animate, pulse = animate, displace = 7, backdrop = 0 }) {
  const holeEls = holes.map((o) => `<ellipse cx="${f(o.x)}" cy="${f(o.y)}" rx="${f(o.r)}" ry="${f(o.r * (o.k || 0.85))}" transform="rotate(${f(o.a || 0)} ${f(o.x)} ${f(o.y)})"/>`).join('');
  const cellEls = cells
    .map((c, i) => {
      const hl = `<ellipse cx="${f(c.x - c.r * 0.32)}" cy="${f(c.y - c.r * 0.34)}" rx="${f(c.r * 0.38)}" ry="${f(c.r * 0.24)}" fill="#fff" opacity=".75" transform="rotate(-30 ${f(c.x)} ${f(c.y)})"/>`;
      return `<g class="c" style="animation-delay:-${f((i * 0.37) % 2.4)}s"><ellipse cx="${f(c.x)}" cy="${f(c.y)}" rx="${f(c.r)}" ry="${f(c.r * 0.82)}" fill="url(#cg)" transform="rotate(${f(c.a)} ${f(c.x)} ${f(c.y)})"/>${hl}</g>`;
    })
    .join('');
  const turb = animate
    ? `<animate attributeName="baseFrequency" values="0.03;0.042;0.03" dur="7s" repeatCount="indefinite"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="cg" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="${p.light}"/><stop offset=".35" stop-color="${p.cell[0]}"/><stop offset=".8" stop-color="${p.cell[1]}"/><stop offset="1" stop-color="${p.dark}"/></radialGradient>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.dark}"/><stop offset=".3" stop-color="${p.base}"/><stop offset=".55" stop-color="${p.dark}"/><stop offset=".8" stop-color="${p.base}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/><g fill="#000">${holeEls}</g></mask>
<filter id="org" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n">${turb}</feTurbulence>
<feDisplacementMap in="SourceGraphic" in2="n" scale="${displace}" xChannelSelector="R" yChannelSelector="G" result="d"/>
<feGaussianBlur in="d" stdDeviation="1.4" result="b"/>
<feSpecularLighting in="b" surfaceScale="3" specularConstant=".9" specularExponent="26" lighting-color="${p.light}" result="s"><fePointLight x="${f(w * 0.3)}" y="${f(-h * 0.2)}" z="${f(Math.max(w, h) * 0.6)}"/></feSpecularLighting>
<feComposite in="s" in2="d" operator="in" result="s2"/>
<feComposite in="d" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".7" k4="0" result="lit"/>
<feDropShadow in="lit" dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity=".55"/>
</filter>
</defs>
<style>.c{transform-box:fill-box;transform-origin:center;${pulse ? 'animation:p 2.4s ease-in-out infinite' : ''}}@keyframes p{50%{transform:scale(1.14)}}</style>
${backdrop ? `<rect width="${w}" height="${h}" fill="${p.hole}" opacity="${backdrop}"/>` : ''}
<g filter="url(#org)"><g mask="url(#m)">${base}</g>${extra}</g>
${cellEls}
</svg>`;
}

// Avatar-Dekoration: Ring aus Membran um den Avatar, Ranken nach innen, Stacheln nach außen.
// Bild ist 1,44× so groß wie der Avatar -> Avatarradius im Bild = 100 / 1,44 ≈ 69
function ring(p, animate, seed) {
  const rand = rng(seed);
  const C = 100;
  const R1 = 52;
  const R2 = 86;
  const holes = packHoles(rand, 3000, () => {
    const a = rand() * Math.PI * 2;
    const r = R1 - 8 + rand() * (R2 - R1 + 12);
    return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r, r: 7 + rand() * 7, a: rand() * 180, k: 0.75 + rand() * 0.25 };
  }, 2.4, 2.5);
  const base = `<path fill-rule="evenodd" fill="url(#bg)" d="M${C - R2} ${C}a${R2} ${R2} 0 1 0 ${R2 * 2} 0a${R2} ${R2} 0 1 0 ${-R2 * 2} 0ZM${C - R1} ${C}a${R1} ${R1} 0 1 0 ${R1 * 2} 0a${R1} ${R1} 0 1 0 ${-R1 * 2} 0Z"/>`;
  let extra = '';
  // Stacheln nach außen
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + rand() * 0.3;
    const len = 9 + rand() * 9;
    const bw = 0.07 + rand() * 0.05;
    const bend = (rand() - 0.5) * 0.25;
    const p1 = [C + Math.cos(a - bw) * (R2 - 3), C + Math.sin(a - bw) * (R2 - 3)];
    const p2 = [C + Math.cos(a + bw) * (R2 - 3), C + Math.sin(a + bw) * (R2 - 3)];
    const tip = [C + Math.cos(a + bend) * (R2 + len), C + Math.sin(a + bend) * (R2 + len)];
    const ctl = [C + Math.cos(a + bend * 0.4) * (R2 + len * 0.45), C + Math.sin(a + bend * 0.4) * (R2 + len * 0.45)];
    extra += `<path fill="${p.base}" d="M${f(p1[0])} ${f(p1[1])}Q${f(ctl[0])} ${f(ctl[1])} ${f(tip[0])} ${f(tip[1])}Q${f(ctl[0])} ${f(ctl[1])} ${f(p2[0])} ${f(p2[1])}Z"/>`;
  }
  const cells = cellsOn(rand, 15, () => {
    const a = rand() * Math.PI * 2;
    const r = R1 + 3 + rand() * (R2 - R1 - 6);
    return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r, r: 3.5 + rand() * 4.5, a: rand() * 180 };
  }, holes);
  return svg({ w: 200, h: 200, base, holes, cells, extra, p, animate });
}

// Namensschild: Netz über die ganze Fläche
function plate(p, animate, seed) {
  const rand = rng(seed);
  const W = 400;
  const H = 100;
  const holes = packHoles(rand, 4000, () => ({ x: rand() * W, y: rand() * H, r: 10 + rand() * 14, a: rand() * 180, k: 0.75 + rand() * 0.25 }), 2.6, 3);
  const base = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  const cells = cellsOn(rand, 16, () => ({ x: rand() * W, y: rand() * H, r: 3.5 + rand() * 5, a: rand() * 180 }), holes);
  return svg({ w: W, h: H, base, holes, cells, p, animate, displace: 8 });
}

// Profil-Effekt: dichter Netz-Rahmen, zur Mitte hin werden die Löcher größer und die Fläche frei
function card(p, animate, seed) {
  const rand = rng(seed);
  const W = 340;
  const H = 540;
  const edge = (x, y) => Math.min(x, y, W - x, H - y);
  const holes = packHoles(rand, 7000, () => {
    const x = rand() * W;
    const y = rand() * H;
    const d = edge(x, y);
    return { x, y, r: Math.min(9 + d * 0.5, 70) + rand() * 6, a: rand() * 180, k: 0.8 + rand() * 0.2 };
  }, 2.8, 3);
  const base = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  const cells = cellsOn(rand, 26, () => {
    const x = rand() * W;
    const y = rand() * H;
    return edge(x, y) > 60 ? null : { x, y, r: 4 + rand() * 6, a: rand() * 180 };
  }, holes);
  return svg({ w: W, h: H, base, holes, cells, p, animate: false, pulse: animate, displace: 9, backdrop: 0.6 });
}

const cache = new Map();
// kind: 'ring' | 'plate' | 'card'; animate = mit Bewegung (für große Ansichten)
export function webArt(variant, kind, animate = true) {
  const key = variant + kind + animate;
  if (!cache.has(key)) {
    const p = WEBS[variant] || WEBS.blood;
    const seed = { ring: 11, plate: 23, card: 37 }[kind] + Object.keys(WEBS).indexOf(variant) * 101;
    const fn = { ring, plate, card }[kind];
    cache.set(key, 'data:image/svg+xml,' + encodeURIComponent(fn(p, animate, seed)));
  }
  return cache.get(key);
}
