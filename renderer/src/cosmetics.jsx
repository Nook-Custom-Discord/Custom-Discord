// Profil-Kosmetik: Avatar-Dekorationen, Profil-Effekte, Namensschilder, Namens-Stile.
// Alles eigene Designs (CSS + Emoji + generierte SVG-Kunst), komplett gratis.
import { WEBS, webArt } from './membrane';

// Netz-Varianten (Blutnetz, Frostnetz, …) gibt es jeweils als Deko, Effekt, Namensschild und Rahmen
const WEB_IDS = Object.keys(WEBS);

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
  // Animierte Premium-Dekorationen: fx = eigene, mehrschichtige Animation (siehe FX_LAYERS)
  { id: 'portal', name: 'Dimensionsportal', cat: 'Episch', fx: 'portal', neu: true },
  { id: 'blackhole', name: 'Schwarzes Loch', cat: 'Episch', fx: 'blackhole', neu: true },
  { id: 'comet', name: 'Kometen', cat: 'Episch', fx: 'comet', neu: true },
  { id: 'magic', name: 'Zauberkreis', cat: 'Episch', fx: 'magic', neu: true },
  { id: 'solar', name: 'Sonnensturm', cat: 'Episch', fx: 'solar', neu: true },
  { id: 'stardust', name: 'Sternenstaub', cat: 'Episch', fx: 'stardust', neu: true },
  { id: 'wings', name: 'Engelsflügel', cat: 'Episch', fx: 'wings', neu: true },
  { id: 'phoenix', name: 'Phönix', cat: 'Episch', ring: 'flame', fx: 'embers', neu: true },
  { id: 'cyber', name: 'Cyber-HUD', cat: 'Sci-Fi', fx: 'cyber', neu: true },
  { id: 'hologram', name: 'Hologramm', cat: 'Sci-Fi', fx: 'hologram', neu: true },
  { id: 'glitch', name: 'Glitch', cat: 'Sci-Fi', fx: 'glitch', neu: true },
  { id: 'matrix', name: 'Matrix', cat: 'Sci-Fi', fx: 'matrix', neu: true },
  { id: 'sonar', name: 'Schallwelle', cat: 'Sci-Fi', fx: 'sonar', neu: true },
  { id: 'storm', name: 'Gewittersturm', cat: 'Wetter', fx: 'storm', neu: true },
  { id: 'snowglobe', name: 'Schneekugel', cat: 'Wetter', ring: 'frost', fx: 'snowglobe', neu: true },
  { id: 'petals', name: 'Blütensturm', cat: 'Wetter', ring: 'sakura', fx: 'petals', neu: true },
  { id: 'lovebubble', name: 'Liebesblase', cat: 'Wetter', ring: 'heartbeat', fx: 'hearts', neu: true },
  ...WEB_IDS.map((v) => ({ id: 'web-' + v, name: WEBS[v].name, cat: 'Netze', web: v, neu: true })),
];
export const DECO_BY_ID = Object.fromEntries(DECORATIONS.map((d) => [d.id, d]));

export function Deco({ id, size }) {
  const d = DECO_BY_ID[id];
  if (!d || !id) return null;
  const small = size < 30;
  // ab Profilgröße spielt die Dekoration beim Erscheinen eine kurze Intro-Animation ab
  return (
    <div class={`deco ${size >= 64 ? 'deco-in' : ''} ${small ? 'deco-sm' : ''}`} style={{ '--sz': size + 'px' }}>
      {d.ring && <div class={`dring dring-${d.ring}`} />}
      {d.fx && <DecoFx fx={d.fx} small={small} />}
      {d.web && (
        // nur große Ansichten bekommen die wabernde Membran, Listen das ruhige Bild
        <div class="dweb" style={{ '--wg': WEBS[d.web].glow }}>
          <img src={webArt(d.web, 'ring', size >= 64)} alt="" draggable={false} />
        </div>
      )}
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

// Partikel für Dekorationen (deterministisch, damit nichts beim Neu-Rendern springt)
function decoParticles(n, cls, place, content) {
  return Array.from({ length: n }, (_, i) => {
    const style = { ...place(i), animationDelay: -rnd(i, 3) * 4 + 's', animationDuration: 2.2 + rnd(i, 4) * 2.4 + 's', '--sx': (rnd(i, 6) - 0.5) * 0.5, '--rot': rnd(i, 9) * 360 + 'deg' };
    return (
      <span class={cls} style={style}>
        {content ? content(i) : null}
      </span>
    );
  });
}
const WING = 'M58 30 C40 2 12 0 2 8 C14 12 20 16 22 20 C10 20 4 26 2 30 C14 30 20 32 24 36 C14 38 8 44 6 50 C18 46 26 48 30 52 C24 56 22 62 22 70 C34 60 50 52 58 40 Z';
const around = (i) => ({ left: 10 + rnd(i, 1) * 80 + '%', top: 50 + rnd(i, 2) * 40 + '%' });
const above = (i) => ({ left: rnd(i, 1) * 100 + '%' });

// Mehrschichtige Animationen der Premium-Dekorationen. Kleine Avatare (Listen) bekommen nur die Ring-Ebene.
const FX_LAYERS = {
  portal: () => (
    <>
      <div class="dfx dfx-portal-a" />
      <div class="dfx dfx-portal-b" />
      <div class="dfx dfx-portal-glow" />
    </>
  ),
  blackhole: (small) => (
    <>
      <div class="dfx dfx-bh-halo" />
      {!small && (
        <div class="dfx dfx-bh-disk">
          <i />
        </div>
      )}
    </>
  ),
  comet: () => (
    <>
      <div class="dfx dfx-comet" />
      <div class="dfx dfx-comet b" />
    </>
  ),
  magic: () => (
    <svg class="dfx dfx-magic" viewBox="0 0 100 100">
      <g class="m-outer">
        <circle cx="50" cy="50" r="47" />
        <circle cx="50" cy="50" r="43" stroke-dasharray="2 4" />
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return <circle class="m-dot" cx={50 + Math.sin(a) * 47} cy={50 - Math.cos(a) * 47} r="2.6" />;
        })}
      </g>
      <circle class="m-runes" cx="50" cy="50" r="43.7" pathLength="100" stroke-dasharray="0.6 1.4 2 1.4 0.6 3" />
    </svg>
  ),
  solar: () => (
    <>
      <div class="dfx dfx-solar-rays" />
      <div class="dfx dfx-solar-rays b" />
      <div class="dring dring-gold" />
    </>
  ),
  stardust: (small) => (
    <>
      <div class="dring dring-gold" />
      {!small && (
        <div class="dfx dfx-stardust">
          {Array.from({ length: 8 }, (_, i) => (
            <span style={{ '--ang': i * 45 + 'deg', animationDelay: i * 0.25 + 's' }} />
          ))}
        </div>
      )}
    </>
  ),
  wings: (small) =>
    small ? (
      <div class="dring dring-angel" />
    ) : (
      <>
        <div class="dring dring-angel" />
        <svg class="dfx dfx-wing l" viewBox="0 0 60 80">
          <path d={WING} />
        </svg>
        <svg class="dfx dfx-wing r" viewBox="0 0 60 80">
          <path d={WING} transform="translate(60 0) scale(-1 1)" />
        </svg>
        <div class="dshape dshape-halo" />
      </>
    ),
  embers: (small) => !small && <div class="dfx dfx-clip-out">{decoParticles(16, 'dp dp-ember', around)}</div>,
  cyber: () => (
    <svg class="dfx dfx-cyber" viewBox="0 0 100 100">
      <circle class="c1" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="18 4 6 4 30 4 2 4 8 20" />
      <circle class="c2" cx="50" cy="50" r="42.5" pathLength="100" stroke-dasharray="8 3 8 3 8 20 1 2 1 2 1 2 1 40" />
      <circle class="c3" cx="50" cy="50" r="38.5" pathLength="100" stroke-dasharray="40 10 20 30" />
    </svg>
  ),
  hologram: (small) => (
    <>
      <div class="dfx dfx-holo-ring" />
      {!small && <div class="dfx dfx-holo-scan" />}
    </>
  ),
  glitch: () => (
    <>
      <div class="dfx dfx-glitch r" />
      <div class="dfx dfx-glitch c" />
      <div class="dfx dfx-glitch w" />
    </>
  ),
  matrix: (small) => (
    <>
      <div class="dfx dfx-matrix-ring" />
      {!small && <div class="dfx dfx-clip-in">{decoParticles(10, 'dp dp-code', above, (i) => (rnd(i, 8) > 0.5 ? '1' : '0'))}</div>}
    </>
  ),
  sonar: () => (
    <>
      <div class="dfx dfx-sonar" />
      <div class="dfx dfx-sonar" style={{ animationDelay: '-.8s' }} />
      <div class="dfx dfx-sonar" style={{ animationDelay: '-1.6s' }} />
    </>
  ),
  storm: (small) => (
    <>
      <div class="dfx dfx-storm-ring" />
      {!small && (
        <svg class="dfx dfx-bolts" viewBox="0 0 100 100">
          <polyline class="b1" points="16,-2 4,20 14,20 0,42" />
          <polyline class="b2" points="88,56 101,76 91,76 103,100" />
          <polyline class="b3" points="72,-10 61,6 69,6 58,22" />
        </svg>
      )}
    </>
  ),
  snowglobe: (small) =>
    !small && (
      <div class="dfx dfx-clip-in dfx-globe">
        {decoParticles(14, 'dp dp-snow', above)}
      </div>
    ),
  petals: (small) => !small && <div class="dfx dfx-clip-out">{decoParticles(9, 'dp dp-petal', above)}</div>,
  hearts: (small) => !small && <div class="dfx dfx-clip-out">{decoParticles(9, 'dp dp-heart', around, () => '❤')}</div>,
};

function DecoFx({ fx, small }) {
  return FX_LAYERS[fx]?.(small) || null;
}

// ---------- Profilrahmen (animierter Rand um die Profilkarte) ----------
export const FRAMES = [
  { id: '', name: 'Kein Rahmen' },
  { id: 'accent', name: 'Akzent' },
  { id: 'rainbow', name: 'Regenbogen' },
  { id: 'gold', name: 'Gold' },
  { id: 'neon', name: 'Neon' },
  { id: 'fire', name: 'Feuer' },
  { id: 'ice', name: 'Eis' },
  { id: 'galaxy', name: 'Galaxie' },
  { id: 'toxic', name: 'Toxisch' },
  { id: 'sakura', name: 'Sakura' },
  { id: 'void', name: 'Leere' },
  { id: 'holo', name: 'Holo' },
  { id: 'pulse', name: 'Herzschlag' },
  { id: 'cyber', name: 'Cyber' },
  ...WEB_IDS.map((v) => ({ id: 'web-' + v, name: WEBS[v].name })),
];

// Der Rand selbst; das passende Leuchten außen setzt die Karte über die Klasse fr-<id>
export function Frame({ id }) {
  if (!id) return null;
  return <div class={`pframe pframe-${id}`} />;
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
  ...WEB_IDS.map((v) => ({ id: 'web-' + v, name: WEBS[v].name, web: v })),
];
const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

function rnd(i, k) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function EffectLayer({ id }) {
  const fx = EFFECT_BY_ID[id];
  if (!fx || !id) return null;
  if (fx.web) {
    const p = WEBS[fx.web];
    return (
      <div class="fxl fx-web" style={{ '--wg': p.glow, '--wc': p.cell[0] }}>
        <div class="fx-web-art" style={{ backgroundImage: `url("${webArt(fx.web, 'card')}")` }} />
        {Array.from({ length: 6 }, (_, i) => (
          <span class="web-drip" style={{ left: 8 + rnd(i, 1) * 84 + '%', top: rnd(i, 2) * 30 + '%', animationDelay: -rnd(i, 3) * 6 + 's', animationDuration: 4 + rnd(i, 4) * 3 + 's' }} />
        ))}
      </div>
    );
  }
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
  ...WEB_IDS.map((v) => ({ id: 'web-' + v, name: WEBS[v].name })),
];

// ---------- Pakete: passende Deko + Effekt + Namensschild + Rahmen auf einen Klick ----------
export const BUNDLES = WEB_IDS.map((v) => ({
  id: v,
  name: WEBS[v].name + '-Paket',
  web: v,
  items: { decoration: 'web-' + v, effect: 'web-' + v, nameplate: 'web-' + v, frame: 'web-' + v },
}));

// Namensschilder und Rahmen der Netze brauchen generierte Bilder bzw. Farben aus WEBS -> einmal als CSS einhängen
(function injectWebStyles() {
  if (typeof document === 'undefined') return;
  const css = WEB_IDS.map((v) => {
    const p = WEBS[v];
    return `.np-web-${v}::before{background-image:url("${webArt(v, 'plate', false)}");background-size:cover;background-position:center;animation:none;opacity:.85}
.fr-web-${v}{--f1:${p.dark};--f2:${p.base};--f3:${p.light};--fg:${p.glow}}
.pframe-web-${v}{background:url("${webArt(v, 'plate', false)}") center/260px auto,${p.dark};padding:6px;animation:none}`;
  }).join('\n');
  const el = document.createElement('style');
  el.id = 'nook-web-styles';
  el.textContent = css;
  document.head.appendChild(el);
})();

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
