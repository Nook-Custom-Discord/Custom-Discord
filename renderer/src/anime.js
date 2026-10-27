// Anime-Stile als animierte SVG-Bilder: Sakura, Fuchsfeuer, Shinobi, Magical Girl, Manga-Action, Katana.
// Eigene Motive (keine Figuren aus Serien). Jeder Stil hat einen Ring (Avatar-Deko), ein Namensschild und einen Profil-Effekt.
// Alles, was "hinter" dem Avatar liegen soll, wird per Maske im Avatar-Kreis ausgeblendet.
import { rng, f } from './membrane';

export const ANIME = {
  sakura: { name: 'Sakura-Sturm', glow: '#f472b6', particle: 'petal', pc: '#fbcfe8', frameBg: '#831843' },
  kitsune: { name: 'Fuchsfeuer', glow: '#38bdf8', particle: 'spark', pc: '#a5f3fc', frameBg: '#0c4a6e' },
  ninja: { name: 'Shinobi', glow: '#ef4444', particle: 'spark', pc: '#e2e8f0', frameBg: '#0f172a' },
  magical: { name: 'Magical Girl', glow: '#e879f9', particle: 'spark', pc: '#fde68a', frameBg: '#6b21a8' },
  manga: { name: 'Manga-Action', glow: '#facc15', particle: 'spark', pc: '#ffffff', frameBg: '#111111' },
  katana: { name: 'Katana', glow: '#f8fafc', particle: 'petal', pc: '#fecaca', frameBg: '#1f2937' },
};

const C = 100; // Mitte des Ring-Bildes
const AV = 69.4; // Avatarradius im Ring-Bild (Bild ist 1,44× so groß wie der Avatar)
const rad = (d) => (d * Math.PI) / 180;
const at = (deg, r) => [C + Math.cos(rad(deg)) * r, C + Math.sin(rad(deg)) * r];
const g = (x, y, inner, rot = 0, s = 1) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s})">${inner}</g>`;

// ---------- Motive (alle um den Ursprung gezeichnet) ----------
function sakura(s) {
  const petal = `M0 0C${f(-s * 0.45)} ${f(-s * 0.3)} ${f(-s * 0.5)} ${f(-s * 0.85)} ${f(-s * 0.18)} ${f(-s)}L0 ${f(-s * 0.84)}L${f(s * 0.18)} ${f(-s)}C${f(s * 0.5)} ${f(-s * 0.85)} ${f(s * 0.45)} ${f(-s * 0.3)} 0 0Z`;
  let o = '';
  for (let i = 0; i < 5; i++) o += `<path d="${petal}" fill="url(#gP)" stroke="#db2777" stroke-opacity=".35" stroke-width="${f(s * 0.04)}" transform="rotate(${i * 72})"/>`;
  for (let i = 0; i < 5; i++) o += `<line x1="0" y1="0" x2="${f(Math.cos(rad(i * 72 + 36)) * s * 0.42)}" y2="${f(Math.sin(rad(i * 72 + 36)) * s * 0.42)}" stroke="#be185d" stroke-width="${f(s * 0.05)}"/><circle cx="${f(Math.cos(rad(i * 72 + 36)) * s * 0.44)}" cy="${f(Math.sin(rad(i * 72 + 36)) * s * 0.44)}" r="${f(s * 0.07)}" fill="#fde047"/>`;
  return o + `<circle r="${f(s * 0.16)}" fill="#f9a8d4"/>`;
}
const petal = (s) => `<path d="M0 ${f(s / 2)}C${f(-s * 0.5)} 0 ${f(-s * 0.3)} ${f(-s / 2)} ${f(-s * 0.08)} ${f(-s / 2)}L0 ${f(-s * 0.36)}L${f(s * 0.08)} ${f(-s / 2)}C${f(s * 0.3)} ${f(-s / 2)} ${f(s * 0.5)} 0 0 ${f(s / 2)}Z" fill="url(#gP)"/>`;
const flame = (s) => `<path d="M0 ${f(s)}C${f(-s * 0.75)} ${f(s * 0.45)} ${f(-s * 0.55)} ${f(-s * 0.25)} ${f(-s * 0.05)} ${f(-s * 1.1)}C${f(s * 0.1)} ${f(-s * 0.5)} ${f(s * 0.45)} ${f(-s * 0.35)} ${f(s * 0.35)} ${f(-s * 0.7)}C${f(s * 0.85)} ${f(-s * 0.1)} ${f(s * 0.7)} ${f(s * 0.6)} 0 ${f(s)}Z" fill="url(#gF)"/><circle cy="${f(s * 0.35)}" r="${f(s * 0.28)}" fill="#fff" opacity=".85"/>`;
function shuriken(s) {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = i * 90;
    const tip = [Math.cos(rad(a)) * s, Math.sin(rad(a)) * s];
    const l = [Math.cos(rad(a - 45)) * s * 0.28, Math.sin(rad(a - 45)) * s * 0.28];
    d += `${i ? 'L' : 'M'}${f(l[0])} ${f(l[1])}Q${f(tip[0] * 0.5 - tip[1] * 0.12)} ${f(tip[1] * 0.5 + tip[0] * 0.12)} ${f(tip[0])} ${f(tip[1])}`;
  }
  return `<path d="${d}Z" fill="url(#gS)" stroke="#0f172a" stroke-width="${f(s * 0.05)}"/><circle r="${f(s * 0.14)}" fill="#0f172a"/><circle r="${f(s * 0.07)}" fill="#94a3b8"/>`;
}
function star(s, fill = 'url(#gG)') {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.45 : s;
    d += `${i ? 'L' : 'M'}${f(Math.cos(rad(i * 36 - 90)) * r)} ${f(Math.sin(rad(i * 36 - 90)) * r)}`;
  }
  return `<path d="${d}Z" fill="${fill}" stroke="#fff" stroke-opacity=".7" stroke-width="${f(s * 0.08)}" stroke-linejoin="round"/>`;
}
const heart = (s, fill = 'url(#gR)') => `<path d="M0 ${f(s * 0.85)}C${f(-s * 1.2)} ${f(s * 0.05)} ${f(-s * 0.7)} ${f(-s * 0.85)} 0 ${f(-s * 0.3)}C${f(s * 0.7)} ${f(-s * 0.85)} ${f(s * 1.2)} ${f(s * 0.05)} 0 ${f(s * 0.85)}Z" fill="${fill}" stroke="#fff" stroke-opacity=".6" stroke-width="${f(s * 0.08)}"/>`;
const sparkle = (s) => `<path d="M0 ${f(-s)}L${f(s * 0.2)} ${f(-s * 0.2)}L${f(s)} 0L${f(s * 0.2)} ${f(s * 0.2)}L0 ${f(s)}L${f(-s * 0.2)} ${f(s * 0.2)}L${f(-s)} 0L${f(-s * 0.2)} ${f(-s * 0.2)}Z" fill="#fff"/>`;
function bow(s) {
  const loop = (dir) => `<path d="M0 0C${f(dir * s * 0.4)} ${f(-s * 0.75)} ${f(dir * s * 1.25)} ${f(-s * 0.55)} ${f(dir * s * 1.1)} 0C${f(dir * s * 1.25)} ${f(s * 0.55)} ${f(dir * s * 0.4)} ${f(s * 0.75)} 0 0Z" fill="url(#gR)" stroke="#9f1239" stroke-width="${f(s * 0.05)}"/>`;
  const tail = (dir) => `<path class="wave" d="M0 ${f(s * 0.1)}L${f(dir * s * 0.55)} ${f(s * 1.15)}L${f(dir * s * 0.32)} ${f(s * 1.0)}L${f(dir * s * 0.18)} ${f(s * 1.2)}Z" fill="#fb7185"/>`;
  return tail(-1) + tail(1) + loop(-1) + loop(1) + `<ellipse rx="${f(s * 0.22)}" ry="${f(s * 0.28)}" fill="#e11d48"/>`;
}
function foxEar(s, dir) {
  return `<path d="M0 0L${f(dir * s * 0.3)} ${f(-s)}L${f(dir * s * 0.75)} ${f(s * 0.05)}Z" fill="#f97316" stroke="#7c2d12" stroke-width="${f(s * 0.04)}"/><path d="M${f(dir * s * 0.18)} ${f(-s * 0.08)}L${f(dir * s * 0.33)} ${f(-s * 0.72)}L${f(dir * s * 0.58)} ${f(-s * 0.06)}Z" fill="#fff7ed"/><path d="M${f(dir * s * 0.3)} ${f(-s)}L${f(dir * s * 0.36)} ${f(-s * 0.78)}L${f(dir * s * 0.25)} ${f(-s * 0.8)}Z" fill="#fff"/>`;
}
function katana(len) {
  // Klinge leicht gebogen, Griff mit Rautenmuster, Tsuba (Stichblatt)
  const blade = `<path d="M0 -2.4Q${f(len * 0.5)} -5 ${f(len)} -1L${f(len)} 1.2Q${f(len * 0.5)} -1.6 0 2.4Z" fill="url(#gB)" stroke="#475569" stroke-width=".4"/><path d="M2 -0.6Q${f(len * 0.5)} -3 ${f(len - 3)} -0.6" stroke="#fff" stroke-width=".5" fill="none" opacity=".9"/>`;
  const glint = `<rect class="glint" x="-8" y="-6" width="8" height="12" fill="url(#gW)"/>`;
  const handle = `<rect x="-26" y="-3.2" width="24" height="6.4" rx="1.6" fill="#111827"/>${Array.from({ length: 5 }, (_, i) => `<path d="M${-24 + i * 4.6} -3.2L${-21.7 + i * 4.6} 0L${-24 + i * 4.6} 3.2L${-26.3 + i * 4.6} 0Z" fill="#b91c1c"/>`).join('')}`;
  const tsuba = `<ellipse rx="2.6" ry="7" fill="#ca8a04" stroke="#713f12" stroke-width=".6"/>`;
  return `<g clip-path="url(#bladeClip${Math.round(len)})">${blade}${glint}</g>${handle}${tsuba}<clipPath id="bladeClip${Math.round(len)}"><path d="M0 -2.4Q${f(len * 0.5)} -5 ${f(len)} -1L${f(len)} 1.2Q${f(len * 0.5)} -1.6 0 2.4Z"/></clipPath>`;
}
// Comic-Ausruf-Blase mit Zacken
function burst(s, text) {
  let d = '';
  for (let i = 0; i < 18; i++) {
    const r = i % 2 ? s * 0.68 : s;
    d += `${i ? 'L' : 'M'}${f(Math.cos(rad(i * 20)) * r)} ${f(Math.sin(rad(i * 20)) * r * 0.82)}`;
  }
  return `<path d="${d}Z" fill="#fde047" stroke="#111" stroke-width="${f(s * 0.08)}" stroke-linejoin="round"/><text y="${f(s * 0.3)}" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-weight="900" font-size="${f(s * 0.9)}" fill="#ef4444" stroke="#111" stroke-width="${f(s * 0.05)}">${text}</text>`;
}

const DEFS = `<radialGradient id="gP" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#fff5fa"/><stop offset=".55" stop-color="#fbcfe8"/><stop offset="1" stop-color="#f472b6"/></radialGradient>
<radialGradient id="gF" cx="50%" cy="70%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#a5f3fc"/><stop offset=".75" stop-color="#38bdf8"/><stop offset="1" stop-color="#1d4ed8" stop-opacity=".7"/></radialGradient>
<linearGradient id="gS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f5f9"/><stop offset=".5" stop-color="#94a3b8"/><stop offset="1" stop-color="#334155"/></linearGradient>
<linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fef9c3"/><stop offset=".5" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
<linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fecdd3"/><stop offset=".5" stop-color="#fb7185"/><stop offset="1" stop-color="#e11d48"/></linearGradient>
<linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#cbd5e1"/><stop offset="1" stop-color="#64748b"/></linearGradient>
<linearGradient id="gW" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="gM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset=".33" stop-color="#c4b5fd"/><stop offset=".66" stop-color="#99f6e4"/><stop offset="1" stop-color="#fde68a"/></linearGradient>
<linearGradient id="gK" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bae6fd"/><stop offset=".5" stop-color="#38bdf8"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient>
<pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#111"/></pattern>
<mask id="behind" maskUnits="userSpaceOnUse" x="-50" y="-50" width="300" height="300"><rect x="-50" y="-50" width="300" height="300" fill="#fff"/><circle cx="${C}" cy="${C}" r="${AV - 1}" fill="#000"/></mask>`;

const CSS = `.orb{transform-box:view-box;transform-origin:50% 50%;animation:orb 16s linear infinite}
.orb.fast{animation-duration:7s}.orb.r{animation-direction:reverse}
.spin{transform-box:fill-box;transform-origin:center;animation:orb 1s linear infinite}
.flick{transform-box:fill-box;transform-origin:50% 85%;animation:flick .7s ease-in-out infinite alternate}
.tw{transform-box:fill-box;transform-origin:center;animation:tw 2.2s ease-in-out infinite}
.flut{transform-box:fill-box;transform-origin:center;animation:flut 2.4s ease-in-out infinite}
.bob{transform-box:fill-box;transform-origin:center;animation:bob 2.6s ease-in-out infinite}
.wave{transform-box:fill-box;transform-origin:50% 0;animation:wave 1.2s ease-in-out infinite alternate}
.flash{animation:flash .45s steps(1) infinite}.flash.b{animation-delay:-.22s}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 1.1s ease-in-out infinite}
.glint{animation:glint 2.6s ease-in-out infinite}
.puff{transform-box:fill-box;transform-origin:center;animation:puff 2.8s ease-out infinite}
.fall{animation:fall 5s linear infinite}
@keyframes orb{to{transform:rotate(360deg)}}
@keyframes flick{from{transform:scale(.92,1.05) skewX(-4deg)}to{transform:scale(1.06,.94) skewX(5deg)}}
@keyframes tw{0%,100%{transform:scale(.55) rotate(0);opacity:.5}50%{transform:scale(1.1) rotate(25deg);opacity:1}}
@keyframes flut{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(22deg) scale(.9)}}
@keyframes bob{50%{transform:translateY(-3px) rotate(4deg)}}
@keyframes wave{from{transform:rotate(-8deg)}to{transform:rotate(10deg)}}
@keyframes flash{50%{opacity:0}}
@keyframes pulse{50%{transform:scale(1.12)}}
@keyframes glint{0%,55%{transform:translateX(0)}100%{transform:translateX(130px)}}
@keyframes puff{0%{transform:scale(.4);opacity:.8}100%{transform:scale(1.6);opacity:0}}
@keyframes fall{0%{transform:translate(0,-20px) rotate(0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate(18px,${'${H}'}px) rotate(400deg);opacity:0}}`;

function svg(w, h, glow, body, animate) {
  const css = CSS.replace('${H}', h + 30) + (animate ? '' : '*{animation:none!important}');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${DEFS}<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="${glow}" flood-opacity=".8"/></filter></defs><style>${css}</style><g filter="url(#gl)">${body}</g></svg>`;
}

// Kreis um den Avatar (optional mit Verlauf) – r knapp außerhalb des Avatars
const band = (stroke, w = 4, extra = '') => `<circle cx="${C}" cy="${C}" r="${AV + 3}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
// Elemente gleichmäßig auf einer Umlaufbahn verteilen; inner bekommt den Index
const around = (n, r, offset, inner) => Array.from({ length: n }, (_, i) => g(...at(offset + (i * 360) / n, r), inner(i), offset + (i * 360) / n + 90)).join('');

// ---------- Ringe ----------
const RINGS = {
  sakura: (rand) =>
    band('#f9a8d4', 4) +
    band('#fff', 1, 'stroke-dasharray="2 5" opacity=".8"') +
    `<g class="orb">${around(7, AV + 4, -70, (i) => `<g class="pulse" style="animation-delay:-${i * 0.3}s">${sakura(i % 2 ? 12 : 16)}</g>`)}</g>` +
    `<g class="orb r fast">${around(10, AV + 20, 10, (i) => `<g class="flut" style="animation-delay:-${f(rand() * 2)}s">${petal(8 + rand() * 3)}</g>`)}</g>`,
  kitsune: (rand) =>
    `<g mask="url(#behind)">${g(C - 38, C - 52, foxEar(34, -1), -18)}${g(C + 38, C - 52, foxEar(34, 1), 18)}</g>` +
    band('url(#gK)', 3) +
    `<g class="orb">${around(6, AV + 15, 0, (i) => `<g class="flick" style="animation-delay:-${f(i * 0.17)}s">${flame(12 + (i % 2) * 3)}</g>`)}</g>`,
  ninja: (rand) =>
    band('#0f172a', 6) +
    band('#ef4444', 1.6) +
    // Stirnband-Enden flattern rechts
    g(C + 58, C - 40, `<path class="wave" d="M0 0Q14 6 30 2L28 8Q14 12 0 6Z" fill="#dc2626"/><path class="wave" style="animation-delay:-.4s" d="M0 4Q12 14 26 16L22 21Q10 18 0 9Z" fill="#b91c1c"/>`, 25) +
    `<g class="orb fast">${around(4, AV + 16, 0, () => `<g class="spin">${shuriken(15)}</g>`)}</g>`,
  magical: (rand) =>
    `<g class="orb">${band('url(#gM)', 5)}</g>` +
    band('#fff', 1, 'opacity=".7"') +
    g(C, C - AV - 8, `<g class="bob">${bow(17)}</g>`) +
    g(...at(140, AV + 8), `<path d="M0 -9A9 9 0 1 0 6 7A7 7 0 1 1 0 -9Z" fill="url(#gG)"/>`, -20) +
    `<g class="orb r">${around(8, AV + 18, 20, (i) => `<g class="tw" style="animation-delay:-${f(i * 0.31)}s">${i % 3 === 0 ? heart(8) : i % 3 === 1 ? star(9) : sparkle(8)}</g>`)}</g>`,
  manga: (rand) => {
    // Speedlines: zwei Sätze, die sich im Anime-Takt abwechseln
    const lines = (n, cls) =>
      `<g class="${cls}">${Array.from({ length: n }, () => {
        const a = rand() * 360;
        const w = 0.8 + rand() * 1.6;
        const r1 = AV + 4 + rand() * 6;
        const r2 = AV + 18 + rand() * 14;
        const p1 = at(a - w, r1);
        const p2 = at(a + w, r1);
        const t = at(a, r2);
        return `<path d="M${f(p1[0])} ${f(p1[1])}L${f(t[0])} ${f(t[1])}L${f(p2[0])} ${f(p2[1])}Z" fill="${rand() > 0.75 ? '#facc15' : '#111'}" stroke="#fff" stroke-width=".4"/>`;
      }).join('')}</g>`;
    return (
      `<circle cx="${C}" cy="${C}" r="${AV + 7}" fill="none" stroke="url(#dots)" stroke-width="9" opacity=".75"/>` +
      band('#111', 2.5) +
      band('#fff', 1) +
      lines(34, 'flash') +
      lines(34, 'flash b') +
      g(C + 52, C - 54, `<g class="pulse">${burst(17, '!!')}</g>`, 8)
    );
  },
  katana: (rand) =>
    `<g mask="url(#behind)">${g(C - 84, C + 84, katana(232), -45)}${g(C + 84, C + 84, katana(232).replace(/bladeClip232/g, 'bladeClipB'), 225)}</g>` +
    band('#1f2937', 4) +
    band('#e5e7eb', 1) +
    `<g class="orb r">${around(6, AV + 14, 30, (i) => `<g class="flut" style="animation-delay:-${f(i * 0.4)}s">${petal(8)}</g>`)}</g>`,
};

// Motiv-Auswahl für Namensschild und Profil-Effekt
const MOTIF = {
  sakura: (i, s, rand) => (i % 3 ? `<g class="flut" style="animation-delay:-${f(rand() * 2)}s">${petal(s * 0.5)}</g>` : `<g class="pulse">${sakura(s * 0.6)}</g>`),
  kitsune: (i, s) => `<g class="flick" style="animation-delay:-${f(i * 0.13)}s">${flame(s * 0.55)}</g>`,
  ninja: (i, s) => (i % 5 ? `<g class="spin">${shuriken(s * 0.5)}</g>` : `<circle class="puff" r="${f(s * 0.35)}" fill="#e2e8f0" opacity=".25"/>`),
  magical: (i, s) => `<g class="tw" style="animation-delay:-${f(i * 0.27)}s">${i % 3 === 0 ? heart(s * 0.4) : i % 3 === 1 ? star(s * 0.5) : sparkle(s * 0.45)}</g>`,
  manga: (i, s, rand) => (i % 4 ? `<path class="flash${i % 2 ? ' b' : ''}" d="M${f(-s)} 0L${f(s)} -1.2L${f(s)} 1.2Z" fill="#111" transform="rotate(${f(rand() * 30 - 15)})"/>` : `<g class="pulse">${burst(s * 0.55, i % 8 ? '!' : '!!')}</g>`),
  katana: (i, s, rand) => `<g class="flut" style="animation-delay:-${f(rand() * 2)}s">${petal(s * 0.45)}</g>`,
};

function ring(v, animate, seed) {
  return svg(200, 200, ANIME[v].glow, RINGS[v](rng(seed)), animate);
}

function plate(v, animate, seed) {
  const rand = rng(seed);
  let body = v === 'manga' ? `<rect width="400" height="100" fill="url(#dots)" opacity=".35"/>` : '';
  if (v === 'katana') body += g(20, 70, katana(300), -6);
  for (let x = 12, i = 0; x < 400; x += 26 + rand() * 22, i++) body += g(x, 20 + rand() * 60, MOTIF[v](i, 24 + rand() * 10, rand), rand() * 360);
  return svg(400, 100, ANIME[v].glow, body, animate);
}

// Profil-Effekt: Motive als Rahmen an den Rändern, Mitte bleibt frei; bei Sakura fallen zusätzlich Blüten
function card(v, animate, seed) {
  const rand = rng(seed);
  const W = 340;
  const H = 540;
  let body = '';
  if (v === 'katana') body += g(-10, 120, katana(300), -28) + g(W + 10, 120, katana(300).replace(/bladeClip300/g, 'bladeClipC'), 180 + 28);
  if (v === 'manga') body += `<rect width="${W}" height="${H}" fill="url(#dots)" opacity=".25"/>`;
  const per = 2 * (W + H);
  for (let s = 0, i = 0; s < per; s += 30 + rand() * 26, i++) {
    let x;
    let y;
    if (s < W) [x, y] = [s, 14 + rand() * 30];
    else if (s < W + H) [x, y] = [W - 14 - rand() * 26, s - W];
    else if (s < 2 * W + H) [x, y] = [W - (s - W - H), H - 14 - rand() * 30];
    else [x, y] = [14 + rand() * 26, H - (s - 2 * W - H)];
    body += g(x, y, MOTIF[v](i, 30 + rand() * 16, rand), rand() * 360);
  }
  if (v === 'sakura' || v === 'katana') for (let i = 0; i < 10; i++) body += g(20 + rand() * (W - 40), 0, `<g class="fall" style="animation-delay:-${f(rand() * 5)}s;animation-duration:${f(4 + rand() * 3)}s">${petal(7 + rand() * 4)}</g>`);
  return svg(W, H, ANIME[v].glow, body, animate);
}

const cache = new Map();
export function animeArt(variant, kind, animate = true) {
  const key = variant + kind + animate;
  if (!cache.has(key)) {
    const v = ANIME[variant] ? variant : 'sakura';
    const seed = { ring: 41, plate: 43, card: 47 }[kind] + Object.keys(ANIME).indexOf(v) * 53;
    // ' bleibt bei encodeURIComponent stehen und würde url('…') in CSS abbrechen
    cache.set(key, 'data:image/svg+xml,' + encodeURIComponent({ ring, plate, card }[kind](v, animate, seed)).replace(/'/g, '%27'));
  }
  return cache.get(key);
}
