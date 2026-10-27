// Profil-Kosmetik: Avatar-Dekorationen, Profil-Effekte, Namensschilder, Namens-Stile.
// Alles eigene Designs (CSS + Emoji), komplett gratis.

// ---------- Avatar-Dekorationen ----------
// ring: CSS-Ring um den Avatar · orbit: kreisende Emojis · acc: feste Accessoires (x/y in % der Avatargröße)
export const DECORATIONS = [
  { id: '', name: 'Keine', cat: 'Basis' },
  { id: 'glow', name: 'Leuchten', cat: 'Ringe', ring: 'glow' },
  { id: 'rainbow', name: 'Regenbogen', cat: 'Ringe', ring: 'rainbow' },
  { id: 'gold', name: 'Goldring', cat: 'Ringe', ring: 'gold' },
  { id: 'prism', name: 'Prisma', cat: 'Ringe', ring: 'prism' },
  { id: 'neon', name: 'Neon', cat: 'Ringe', ring: 'neon' },
  { id: 'aurora', name: 'Polarlicht', cat: 'Ringe', ring: 'aurora' },
  { id: 'heartbeat', name: 'Herzschlag', cat: 'Ringe', ring: 'heartbeat', orbit: { e: ['💖', '💗', '💕'], n: 3, speed: 9 } },
  { id: 'electric', name: 'Hochspannung', cat: 'Ringe', ring: 'electric', acc: [{ e: '⚡', x: 82, y: 4, s: 34, r: 15, a: 'zap' }, { e: '⚡', x: 2, y: 70, s: 26, r: -20, a: 'zap2' }] },
  { id: 'void', name: 'Leere', cat: 'Ringe', ring: 'void' },
  { id: 'orbit', name: 'Umlaufbahn', cat: 'Ringe', ring: 'dashed', orbit: { e: ['●'], n: 1, speed: 4, color: 'var(--deco)' } },
  { id: 'flame', name: 'Flammen', cat: 'Elemente', ring: 'flame', acc: [{ e: '🔥', x: 70, y: 70, s: 34, a: 'flicker' }] },
  { id: 'lava', name: 'Lava', cat: 'Elemente', ring: 'lava', acc: [{ e: '🌋', x: 74, y: 72, s: 30 }] },
  { id: 'frost', name: 'Frost', cat: 'Elemente', ring: 'frost', orbit: { e: ['❄️'], n: 4, speed: 14 } },
  { id: 'ocean', name: 'Ozean', cat: 'Elemente', ring: 'ocean', orbit: { e: ['🫧'], n: 5, speed: 12 } },
  { id: 'toxic', name: 'Toxisch', cat: 'Elemente', ring: 'toxic', acc: [{ e: '🧪', x: 74, y: 70, s: 30, r: 20, a: 'bob' }] },
  { id: 'galaxy', name: 'Galaxie', cat: 'Weltraum', ring: 'galaxy', orbit: { e: ['✨'], n: 4, speed: 16 } },
  { id: 'planet', name: 'Planet', cat: 'Weltraum', ring: 'galaxy', acc: [{ e: '🪐', x: 76, y: -6, s: 36, a: 'bob' }] },
  { id: 'moon', name: 'Mond & Sterne', cat: 'Weltraum', ring: 'void', acc: [{ e: '🌙', x: -8, y: -6, s: 34, r: -20 }], orbit: { e: ['⭐', '✨'], n: 4, speed: 18 } },
  { id: 'stars', name: 'Sternenkranz', cat: 'Weltraum', orbit: { e: ['⭐', '🌟', '✨'], n: 6, speed: 20, twinkle: true } },
  { id: 'rocket', name: 'Rakete', cat: 'Weltraum', orbit: { e: ['🚀'], n: 1, speed: 5 }, ring: 'dashed' },
  { id: 'crown', name: 'Krone', cat: 'Kopfschmuck', acc: [{ e: '👑', x: 30, y: -30, s: 40, r: -12 }] },
  { id: 'halo', name: 'Heiligenschein', cat: 'Kopfschmuck', ring: 'angel', shape: 'halo' },
  { id: 'horns', name: 'Teufelshörner', cat: 'Kopfschmuck', ring: 'devil', shape: 'horns' },
  { id: 'catears', name: 'Katzenohren', cat: 'Kopfschmuck', shape: 'catears' },
  { id: 'bunny', name: 'Hasenohren', cat: 'Kopfschmuck', shape: 'bunny' },
  { id: 'headphones', name: 'Kopfhörer', cat: 'Kopfschmuck', acc: [{ e: '🎧', x: 18, y: -22, s: 58 }], orbit: { e: ['🎵', '🎶'], n: 2, speed: 10 } },
  { id: 'tophat', name: 'Zauberhut', cat: 'Kopfschmuck', acc: [{ e: '🎩', x: 40, y: -32, s: 40, r: 14 }, { e: '✨', x: 0, y: 4, s: 20, a: 'twinkle' }, { e: '✨', x: 86, y: 60, s: 16, a: 'twinkle2' }] },
  { id: 'flowercrown', name: 'Blumenkranz', cat: 'Kopfschmuck', acc: [{ e: '🌸', x: 6, y: -4, s: 24 }, { e: '🌼', x: 26, y: -14, s: 24 }, { e: '🌺', x: 50, y: -16, s: 24 }, { e: '🌷', x: 72, y: -8, s: 24 }, { e: '🌸', x: 86, y: 8, s: 22 }] },
  { id: 'party', name: 'Party', cat: 'Spaß', acc: [{ e: '🎉', x: 72, y: -14, s: 34, r: 20 }, { e: '🎈', x: -12, y: 40, s: 30, a: 'bob' }], orbit: { e: ['🎊'], n: 3, speed: 11 } },
  { id: 'gamer', name: 'Gamer', cat: 'Spaß', ring: 'gamer', acc: [{ e: '🎮', x: 70, y: 70, s: 32, r: -15 }] },
  { id: 'pizza', name: 'Pizza-Party', cat: 'Spaß', orbit: { e: ['🍕'], n: 4, speed: 10 } },
  { id: 'coffee', name: 'Kaffee', cat: 'Spaß', acc: [{ e: '☕', x: 72, y: 70, s: 32 }, { e: '♨️', x: 78, y: 46, s: 18, a: 'rise' }] },
  { id: 'money', name: 'Reich', cat: 'Spaß', ring: 'gold', orbit: { e: ['💸', '💰'], n: 4, speed: 12 } },
  { id: 'diamond', name: 'Diamant', cat: 'Spaß', ring: 'prism', acc: [{ e: '💎', x: 72, y: 70, s: 32, a: 'bob' }] },
  { id: 'cloud9', name: 'Wolke 7', cat: 'Spaß', acc: [{ e: '🌈', x: 20, y: -28, s: 46 }, { e: '☁️', x: 64, y: 66, s: 34, a: 'bob' }, { e: '☁️', x: -14, y: 62, s: 26, a: 'bob2' }] },
  { id: 'sakura', name: 'Kirschblüte', cat: 'Natur', ring: 'sakura', orbit: { e: ['🌸'], n: 5, speed: 16 } },
  { id: 'butterflies', name: 'Schmetterlinge', cat: 'Natur', orbit: { e: ['🦋'], n: 3, speed: 9, flap: true } },
  { id: 'leaves', name: 'Herbstlaub', cat: 'Natur', orbit: { e: ['🍂', '🍁', '🍃'], n: 6, speed: 18 } },
  { id: 'sun', name: 'Sonne', cat: 'Natur', ring: 'gold', acc: [{ e: '☀️', x: 72, y: -14, s: 36, a: 'spin' }] },
  { id: 'paws', name: 'Pfoten', cat: 'Natur', orbit: { e: ['🐾'], n: 4, speed: 14 } },
  { id: 'unicorn', name: 'Einhorn', cat: 'Fabelwesen', ring: 'rainbow', acc: [{ e: '🦄', x: 74, y: -12, s: 36 }] },
  { id: 'dragon', name: 'Drache', cat: 'Fabelwesen', ring: 'flame', acc: [{ e: '🐉', x: -18, y: 60, s: 40, a: 'bob' }] },
  { id: 'ghosts', name: 'Geister', cat: 'Gruselig', ring: 'void', orbit: { e: ['👻'], n: 3, speed: 12, float: true } },
  { id: 'skulls', name: 'Totenköpfe', cat: 'Gruselig', ring: 'shadow', orbit: { e: ['💀'], n: 4, speed: 14 } },
  { id: 'halloween', name: 'Halloween', cat: 'Gruselig', ring: 'lava', acc: [{ e: '🎃', x: 70, y: 68, s: 34 }], orbit: { e: ['🦇'], n: 3, speed: 8 } },
  { id: 'christmas', name: 'Weihnachten', cat: 'Feiertage', ring: 'frost', acc: [{ e: '🎄', x: -12, y: 58, s: 34 }, { e: '🎁', x: 74, y: 70, s: 28 }], orbit: { e: ['❄️'], n: 3, speed: 15 } },
  { id: 'newyear', name: 'Silvester', cat: 'Feiertage', orbit: { e: ['🎆', '🎇'], n: 4, speed: 12, twinkle: true }, ring: 'gold' },
  { id: 'love', name: 'Verliebt', cat: 'Feiertage', ring: 'heartbeat', acc: [{ e: '💘', x: 72, y: -10, s: 32, a: 'bob' }], orbit: { e: ['❤️'], n: 4, speed: 10 } },
  { id: 'easter', name: 'Ostern', cat: 'Feiertage', acc: [{ e: '🐣', x: 72, y: 70, s: 30 }, { e: '🥚', x: -10, y: 66, s: 26 }, { e: '🌷', x: 76, y: -6, s: 24 }] },
];
export const DECO_BY_ID = Object.fromEntries(DECORATIONS.map((d) => [d.id, d]));

export function Deco({ id, size }) {
  const d = DECO_BY_ID[id];
  if (!d || !id) return null;
  const small = size < 30;
  return (
    <div class="deco" style={{ '--sz': size + 'px' }}>
      {d.ring && <div class={`dring dring-${d.ring}`} />}
      {d.shape && !small && <div class={`dshape dshape-${d.shape}`} />}
      {!small &&
        d.acc?.map((a) => (
          <span class={`dacc ${a.a ? 'da-' + a.a : ''}`} style={{ left: a.x + '%', top: a.y + '%', fontSize: (a.s / 100) * size + 'px', '--r': (a.r || 0) + 'deg' }}>
            {a.e}
          </span>
        ))}
      {!small && d.orbit && (
        <div class="dorbit" style={{ animationDuration: d.orbit.speed + 's' }}>
          {Array.from({ length: d.orbit.n }, (_, i) => {
            const ang = (i / d.orbit.n) * 360;
            return (
              <span class={`dorb ${d.orbit.twinkle ? 'da-twinkle' : ''} ${d.orbit.flap ? 'da-flap' : ''} ${d.orbit.float ? 'da-bob' : ''}`} style={{ '--ang': ang + 'deg', fontSize: size * 0.22 + 'px', color: d.orbit.color, animationDelay: i * 0.4 + 's' }}>
                <i style={{ animationDuration: d.orbit.speed + 's' }}>{d.orbit.e[i % d.orbit.e.length]}</i>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Profil-Effekte (Partikel) ----------
export const EFFECTS = [
  { id: '', name: 'Kein Effekt' },
  { id: 'sparkle', name: 'Glitzer', items: ['✨'], mode: 'twinkle', n: 14 },
  { id: 'stars', name: 'Sternenhimmel', items: ['dot', 'dot', '⭐'], mode: 'twinkle', n: 22, overlay: 'night' },
  { id: 'galaxy', name: 'Nebel', items: ['dot', '✨'], mode: 'twinkle', n: 18, overlay: 'nebula' },
  { id: 'snow', name: 'Schnee', items: ['❄️', 'dot'], mode: 'fall', n: 20 },
  { id: 'hearts', name: 'Herzen', items: ['💗', '💖', '💕'], mode: 'rise', n: 12 },
  { id: 'confetti', name: 'Konfetti', items: ['sq'], mode: 'drift', n: 26 },
  { id: 'sakura', name: 'Kirschblüten', items: ['🌸'], mode: 'drift', n: 12 },
  { id: 'leaves', name: 'Herbstlaub', items: ['🍂', '🍁'], mode: 'drift', n: 12 },
  { id: 'bubbles', name: 'Seifenblasen', items: ['🫧'], mode: 'rise', n: 12 },
  { id: 'fireflies', name: 'Glühwürmchen', items: ['glow'], mode: 'float', n: 16, overlay: 'dusk' },
  { id: 'embers', name: 'Glut', items: ['ember'], mode: 'rise', n: 22, overlay: 'heat' },
  { id: 'fire', name: 'Inferno', items: ['🔥'], mode: 'rise', n: 10, overlay: 'heat' },
  { id: 'rain', name: 'Regen', items: ['drop'], mode: 'rain', n: 30, overlay: 'storm' },
  { id: 'lightning', name: 'Gewitter', items: ['drop'], mode: 'rain', n: 20, overlay: 'lightning' },
  { id: 'aurora', name: 'Polarlicht', items: ['dot'], mode: 'twinkle', n: 10, overlay: 'aurora' },
  { id: 'money', name: 'Geldregen', items: ['💸', '💵', '🪙'], mode: 'drift', n: 12 },
  { id: 'music', name: 'Musik', items: ['🎵', '🎶'], mode: 'rise', n: 12 },
  { id: 'ghosts', name: 'Spuk', items: ['👻'], mode: 'float', n: 6, overlay: 'night' },
  { id: 'butterflies', name: 'Schmetterlinge', items: ['🦋'], mode: 'float', n: 7 },
  { id: 'pizza', name: 'Pizzaregen', items: ['🍕'], mode: 'drift', n: 10 },
  { id: 'gaming', name: 'Gaming', items: ['🎮', '👾', '🕹️'], mode: 'float', n: 8, overlay: 'grid' },
  { id: 'skulls', name: 'Totenköpfe', items: ['💀'], mode: 'drift', n: 8, overlay: 'night' },
  { id: 'rainbow', name: 'Regenbogen', items: ['🌈', '✨'], mode: 'float', n: 6, overlay: 'rainbow' },
  { id: 'matrix', name: 'Matrix', items: ['code'], mode: 'rain', n: 18, overlay: 'matrix' },
];
const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

function rnd(i, k) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function EffectLayer({ id }) {
  const fx = EFFECT_BY_ID[id];
  if (!fx || !id) return null;
  return (
    <div class={`fxl ${fx.overlay ? 'fxo-' + fx.overlay : ''}`}>
      {Array.from({ length: fx.n }, (_, i) => {
        const it = fx.items[i % fx.items.length];
        const style = {
          left: rnd(i, 1) * 100 + '%',
          top: fx.mode === 'twinkle' || fx.mode === 'float' ? rnd(i, 2) * 100 + '%' : undefined,
          animationDelay: -rnd(i, 3) * 8 + 's',
          animationDuration: (fx.mode === 'rain' ? 0.8 + rnd(i, 4) * 0.6 : 4 + rnd(i, 4) * 5) + 's',
          fontSize: 12 + rnd(i, 5) * 12 + 'px',
          '--sway': (rnd(i, 6) - 0.5) * 80 + 'px',
          '--hue': Math.floor(rnd(i, 7) * 360),
        };
        let content = it;
        let cls = '';
        if (it === 'dot') (content = ''), (cls = 'p-dot');
        else if (it === 'sq') (content = ''), (cls = 'p-sq');
        else if (it === 'glow') (content = ''), (cls = 'p-glow');
        else if (it === 'ember') (content = ''), (cls = 'p-ember');
        else if (it === 'drop') (content = ''), (cls = 'p-drop');
        else if (it === 'code') (content = String.fromCharCode(0x30a0 + Math.floor(rnd(i, 8) * 90))), (cls = 'p-code');
        return (
          <span class={`fxp fxm-${fx.mode} ${cls}`} style={style}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

// ---------- Namensschilder (Hintergrund in Mitglieder-/DM-Liste) ----------
export const NAMEPLATES = [
  { id: '', name: 'Keins' },
  { id: 'sunset', name: 'Sonnenuntergang' },
  { id: 'ocean', name: 'Tiefsee' },
  { id: 'forest', name: 'Wald' },
  { id: 'galaxy', name: 'Galaxie' },
  { id: 'candy', name: 'Zuckerwatte' },
  { id: 'fire', name: 'Feuer' },
  { id: 'ice', name: 'Eis' },
  { id: 'gold', name: 'Gold' },
  { id: 'neon', name: 'Neon-City' },
  { id: 'sakura', name: 'Sakura' },
  { id: 'aurora', name: 'Polarlicht' },
  { id: 'matrix', name: 'Matrix' },
  { id: 'lava', name: 'Lava' },
  { id: 'midnight', name: 'Mitternacht' },
  { id: 'rainbow', name: 'Regenbogen' },
  { id: 'toxic', name: 'Toxisch' },
];

// ---------- Namens-Stile ----------
export const NAME_FONTS = [
  ['', 'Standard'],
  ['serif', 'Elegant'],
  ['mono', 'Code'],
  ['round', 'Verspielt'],
  ['bold', 'Laut'],
  ['hand', 'Handschrift'],
  ['pixel', 'Pixel'],
  ['script', 'Schnörkel'],
  ['block', 'Block'],
  ['horror', 'Horror'],
  ['future', 'Zukunft'],
  ['marker', 'Marker'],
];
export const NAME_EFFECTS = [
  ['', 'Kein Effekt'],
  ['glow', 'Leuchten'],
  ['shimmer', 'Schimmern'],
  ['neon', 'Neon'],
  ['pop', '3D'],
  ['wave', 'Welle'],
  ['glitch', 'Glitch'],
];

export function nameClasses(ns) {
  const cls = [];
  if (ns?.font) cls.push('nfont-' + ns.font);
  if (ns?.colors?.[0]) cls.push('nstyle');
  if (ns?.effect) cls.push('neff-' + ns.effect);
  return cls.join(' ');
}
export function nameVars(ns) {
  if (!ns?.colors?.[0]) return {};
  return { '--n1': ns.colors[0], '--n2': ns.colors[1] || ns.colors[0] };
}
