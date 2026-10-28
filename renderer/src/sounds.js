// UI-Sounds: synthetische Sound-Pakete (Glocken, Retro, Kristall, …) plus eigene Sounds pro Ereignis.
import { S, prefs } from './store';

let ctx = null;
let out = null; // weicher Pfad: Tiefpass + leichter Hall
let dry = null; // direkter Pfad, z. B. für Glasklänge und eigene Dateien
let idleTimer = 0;
// Nach dem letzten Ton gibt Nook das Audiogerät wieder frei: ein dauerhaft offener Ausgabe-Kanal hält
// Bluetooth-Headsets belegt und erzeugt bei manchen ein leises Rauschen oder Knacken.
function releaseLater(sec = 3) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (ctx?.state === 'running') ctx.suspend().catch(() => {});
  }, (sec + 1.5) * 1000);
}
function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    // sanfter Tiefpass + leichter Hall-Ersatz (Delay) -> nichts klingt spitz
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.Q.value = 0.4;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.18;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    lp.connect(master);
    lp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(master);
    master.connect(ctx.destination);
    out = lp;
    dry = master;
  }
  if (ctx.state === 'suspended') ctx.resume();
  releaseLater();
  if (prefs.outputDevice && ctx.setSinkId && ctx._sink !== prefs.outputDevice) {
    ctx._sink = prefs.outputDevice;
    ctx.setSinkId(prefs.outputDevice).catch(() => {});
  }
  return ctx;
}

// Hüllkurve: Anschlag, Abfall auf "sustain", natürliches Ausklingen
function env(g, t, v, attack, dur, sustain = 0.35) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v * sustain), t + Math.max(attack + 0.01, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function osc(type, freq, t, dur, dest) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return [o, g];
}

// ---------- Instrumente: (Frequenz, Startzeit, Dauer, Lautstärke) ----------
const INST = {
  // Sinus + leiser Oberton: weiche Glocke
  bell(f, t, dur, v) {
    for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.05]]) env(osc('sine', f * mult, t, dur, out)[1], t, v * amp, 0.018, dur);
  },
  // Holz/Marimba: kurzer Anschlag, schneller Abfall
  pluck(f, t, dur, v) {
    const d = dur * 0.7;
    env(osc('sine', f, t, d, out)[1], t, v, 0.004, d, 0.2);
    env(osc('sine', f * 4, t, d * 0.3, out)[1], t, v * 0.08, 0.002, d * 0.3, 0.1);
  },
  // 8-Bit: Rechteck mit hartem Ende
  chip(f, t, dur, v) {
    const d = dur * 0.6;
    const [, g] = osc('square', f, t, d, out);
    g.gain.setValueAtTime(v * 0.32, t);
    g.gain.setValueAtTime(v * 0.32, t + d * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
  },
  // Glas: unharmonische Teiltöne, leicht verstimmt -> schimmert
  glass(f, t, dur, v) {
    for (const [mult, amp, det] of [[1, 1, 0], [1.004, 0.5, 0], [2.76, 0.22, 0], [5.4, 0.06, 0]]) {
      const [o, g] = osc('sine', f * mult, t, dur * 1.5, dry);
      o.detune.value = det;
      env(g, t, v * amp * 0.8, 0.006, dur * 1.5, 0.45);
    }
  },
  // Wassertropfen: Tonhöhe springt kurz nach oben
  drop(f, t, dur, v) {
    const d = Math.min(dur, 0.28);
    const [o, g] = osc('sine', f * 0.55, t, d, out);
    o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.06);
    env(g, t, v * 1.2, 0.006, d, 0.3);
  },
  // Warmes E-Piano: zwei leicht verstimmte Dreiecke + Oktave
  epiano(f, t, dur, v) {
    for (const [mult, amp, det] of [[1, 0.8, -7], [1, 0.8, 7], [2, 0.15, 0]]) {
      const [o, g] = osc('triangle', f * mult, t, dur * 1.3, out);
      o.detune.value = det;
      env(g, t, v * amp, 0.012, dur * 1.3, 0.5);
    }
  },
  // FM-Synthese: metallisch-futuristisch, mit leichtem Gleiten nach oben
  fm(f, t, dur, v) {
    const [car, g] = osc('sine', f, t, dur, out);
    car.frequency.linearRampToValueAtTime(f * 1.03, t + dur);
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    mod.frequency.value = f * 2.01;
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    mod.connect(mg).connect(car.frequency);
    mod.start(t);
    mod.stop(t + dur + 0.05);
    env(g, t, v, 0.01, dur, 0.4);
  },
};

// Kurzer Gleit-Ton für Mute/Unmute, Wellenform je nach Paket
function sweep(type, from, to, t, dur, v) {
  const [o, g] = osc(type, from, t, dur, out);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v * (type === 'square' ? 0.35 : 1), t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// Noten (Hz)
const N = { G4: 392, A4: 440, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5 };

// Melodien: [Frequenz, Start, Dauer, Lautstärke] bzw. für Gleit-Töne [von, nach, Start, Dauer, Lautstärke]
const MELODY = {
  message: [[N.E5, 0, 0.5, 0.11], [N.A5, 0.09, 0.6, 0.09]],
  mention: [[N.C5, 0, 0.45, 0.11], [N.E5, 0.08, 0.45, 0.1], [N.G5, 0.16, 0.65, 0.09]],
  send: [[N.A5, 0, 0.22, 0.05]],
  friend: [[N.G5, 0, 0.35, 0.09], [N.C6, 0.08, 0.35, 0.09], [N.E6, 0.16, 0.6, 0.07]],
  join: [[N.G4, 0, 0.4, 0.11], [N.C5, 0.1, 0.4, 0.11], [N.E5, 0.2, 0.6, 0.1]],
  leave: [[N.E5, 0, 0.4, 0.1], [N.C5, 0.1, 0.4, 0.1], [N.G4, 0.2, 0.6, 0.1]],
  streamStart: [[N.C5, 0, 0.35, 0.09], [N.G5, 0.1, 0.35, 0.09], [N.C6, 0.2, 0.7, 0.08]],
  streamStop: [[N.C6, 0, 0.35, 0.08], [N.G5, 0.1, 0.35, 0.09], [N.C5, 0.2, 0.7, 0.09]],
  hangup: [[N.E5, 0, 0.35, 0.1], [N.A4, 0.12, 0.7, 0.1]],
  ring: [[N.E5, 0, 0.7, 0.1], [N.G5, 0.22, 0.7, 0.1], [N.C6, 0.44, 0.7, 0.1], [N.G5, 0.9, 0.7, 0.1], [N.C6, 1.12, 0.7, 0.1]],
};
const SWEEPS = {
  mute: [[520, 300, 0, 0.16, 0.09]],
  unmute: [[300, 520, 0, 0.16, 0.09]],
  deafen: [[480, 280, 0, 0.15, 0.08], [360, 200, 0.12, 0.18, 0.08]],
  undeafen: [[200, 360, 0, 0.15, 0.08], [280, 480, 0.12, 0.18, 0.08]],
};

// tr = Transponierung in Halbtönen, tempo = Zeitstreckung, vol = Lautstärke-Faktor, max = höchstens so viele Töne
export const PACKS = [
  { id: 'nook', name: 'Nook', emoji: '🔔', desc: 'Weiche Glocken', inst: 'bell', wave: 'sine' },
  { id: 'crystal', name: 'Kristall', emoji: '💎', desc: 'Klare, schimmernde Glasklänge', inst: 'glass', wave: 'sine', tr: 12 },
  { id: 'bubble', name: 'Blubber', emoji: '🫧', desc: 'Runde Wassertropfen', inst: 'drop', wave: 'sine', tempo: 0.85 },
  { id: 'retro', name: 'Retro', emoji: '👾', desc: '8-Bit wie auf dem Game Boy', inst: 'chip', wave: 'square', tempo: 0.7 },
  { id: 'lofi', name: 'Lo-Fi', emoji: '🎹', desc: 'Warmes, entspanntes E-Piano', inst: 'epiano', wave: 'triangle', tr: -12, tempo: 1.25 },
  { id: 'scifi', name: 'Sci-Fi', emoji: '🛸', desc: 'Futuristische FM-Töne', inst: 'fm', wave: 'triangle', tr: -5 },
  { id: 'marimba', name: 'Marimba', emoji: '🪵', desc: 'Holzig & fröhlich', inst: 'pluck', wave: 'sine' },
  { id: 'soft', name: 'Dezent', emoji: '🍃', desc: 'Ganz leise, nur ein Ton', inst: 'pluck', wave: 'sine', vol: 0.6, max: 1 },
];
const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));

// Ereignisse in der Reihenfolge, wie sie in den Einstellungen erscheinen
export const SOUND_EVENTS = [
  ['message', 'Neue Nachricht'],
  ['mention', 'Erwähnung'],
  ['send', 'Nachricht gesendet'],
  ['friend', 'Freundschaftsanfrage'],
  ['ring', 'Eingehender Anruf'],
  ['join', 'Jemand kommt in den Sprachkanal'],
  ['leave', 'Jemand verlässt den Sprachkanal'],
  ['hangup', 'Auflegen'],
  ['mute', 'Stummschalten'],
  ['unmute', 'Stummschaltung aus'],
  ['deafen', 'Taub schalten'],
  ['undeafen', 'Taub aus'],
  ['streamStart', 'Stream startet'],
  ['streamStop', 'Stream endet'],
];

function synth(name, packId) {
  const p = PACK_BY_ID[packId] || PACKS[0];
  const c = ac();
  const now = c.currentTime + 0.01;
  const k = 2 ** ((p.tr || 0) / 12);
  const tempo = p.tempo || 1;
  const vol = prefs.soundVolume * (p.vol || 1);
  const sw = SWEEPS[name];
  if (sw) {
    for (const [a, b, t, d, v] of sw) sweep(p.wave, a * k, b * k, now + t * tempo, d * tempo, v * vol);
    return;
  }
  const notes = (MELODY[name] || []).slice(0, p.max || 99);
  for (const [f, t, d, v] of notes) INST[p.inst](f * k, now + t * tempo, d * tempo, v * vol);
}

// ---------- Eigene Sound-Dateien ----------
const buffers = new Map();
function absUrl(u) {
  return u.startsWith('/uploads/') ? S.serverUrl + u : u;
}
function loadBuffer(url) {
  if (!buffers.has(url)) {
    const p = fetch(absUrl(url))
      .then((r) => {
        if (!r.ok) throw new Error('Sound nicht gefunden');
        return r.arrayBuffer();
      })
      .then((b) => ac().decodeAudioData(b));
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
  }
  return buffers.get(url);
}
// spielt eine Datei (höchstens maxDur Sekunden) und liefert ihre Länge
async function playFile(url, maxDur = 6) {
  const buf = await loadBuffer(url);
  const c = ac();
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  const t = c.currentTime;
  const len = Math.min(buf.duration, maxDur);
  g.gain.setValueAtTime(prefs.soundVolume, t);
  if (buf.duration > maxDur) g.gain.linearRampToValueAtTime(0.0001, t + len);
  src.connect(g).connect(dry);
  src.start(t);
  src.stop(t + len + 0.05);
  releaseLater(len);
  return len;
}

function play(name, packId = prefs.soundPack) {
  const custom = prefs.customSounds?.[name];
  if (custom?.url) return playFile(custom.url).catch(() => synth(name, packId));
  synth(name, packId);
}

export function soundEnabled(name) {
  return prefs.sounds && prefs.soundEvents?.[name] !== false;
}

export function sfx(name) {
  if (!soundEnabled(name)) return;
  try {
    play(name);
  } catch {}
}

// Vorschau in den Einstellungen – unabhängig davon, ob das Ereignis an ist
export function previewSound(name, packId) {
  try {
    if (packId) synth(name, packId);
    else play(name);
  } catch {}
}

let ringTimer = null;
let ringStopTimer = null;
let ringGen = 0; // jede neue Klingel-Runde bekommt eine Nummer, alte Schleifen beenden sich dann selbst
export function startRing() {
  stopRing();
  const gen = ringGen;
  const ring = async () => {
    let wait = 3.5;
    if (soundEnabled('ring')) {
      try {
        const custom = prefs.customSounds?.ring;
        // eigene Klingeltöne laufen ganz durch, danach kurze Pause
        if (custom?.url) wait = Math.max(2, (await playFile(custom.url, 15)) + 0.8);
        else synth('ring', prefs.soundPack);
      } catch {
        synth('ring', prefs.soundPack);
      }
    }
    if (gen === ringGen) ringTimer = setTimeout(ring, wait * 1000);
  };
  ring();
  ringStopTimer = setTimeout(stopRing, 45000);
}
export function stopRing() {
  clearTimeout(ringTimer);
  clearTimeout(ringStopTimer);
  ringGen++;
}
