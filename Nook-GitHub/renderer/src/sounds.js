// UI-Sounds: weiche, angenehme Töne (Glocken-/Marimba-artig), synthetisch erzeugt.
import { prefs } from './store';

let ctx = null;
let out = null;
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
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (prefs.outputDevice && ctx.setSinkId && ctx._sink !== prefs.outputDevice) {
    ctx._sink = prefs.outputDevice;
    ctx.setSinkId(prefs.outputDevice).catch(() => {});
  }
  return ctx;
}

// Weicher "Glocken"-Ton: Sinus + leiser Oberton, sanfter Anschlag, natürliches Ausklingen
function bell(freq, start, dur = 0.45, vol = 0.12) {
  const c = ac();
  const t = c.currentTime + start;
  const v = vol * prefs.soundVolume;
  for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.05]]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * amp, t + 0.018);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v * amp * 0.35), t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// Kurzer, runder "Blop" für Mute/Unmute
function blop(from, to, start = 0, dur = 0.16, vol = 0.1) {
  const c = ac();
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * prefs.soundVolume, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Noten (Hz)
const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, G4: 392, A4: 440, E4: 329.63, C4: 261.63 };

const SFX = {
  message: () => {
    bell(N.E5, 0, 0.5, 0.11);
    bell(N.A5, 0.09, 0.6, 0.09);
  },
  mention: () => {
    bell(N.C5, 0, 0.45, 0.11);
    bell(N.E5, 0.08, 0.45, 0.1);
    bell(N.G5, 0.16, 0.65, 0.09);
  },
  join: () => {
    bell(N.G4, 0, 0.4, 0.11);
    bell(N.C5, 0.1, 0.4, 0.11);
    bell(N.E5, 0.2, 0.6, 0.1);
  },
  leave: () => {
    bell(N.E5, 0, 0.4, 0.1);
    bell(N.C5, 0.1, 0.4, 0.1);
    bell(N.G4, 0.2, 0.6, 0.1);
  },
  mute: () => blop(520, 300, 0, 0.16, 0.09),
  unmute: () => blop(300, 520, 0, 0.16, 0.09),
  deafen: () => {
    blop(480, 280, 0, 0.15, 0.08);
    blop(360, 200, 0.12, 0.18, 0.08);
  },
  undeafen: () => {
    blop(200, 360, 0, 0.15, 0.08);
    blop(280, 480, 0.12, 0.18, 0.08);
  },
  streamStart: () => {
    bell(N.C5, 0, 0.35, 0.09);
    bell(N.G5, 0.1, 0.35, 0.09);
    bell(N.C6, 0.2, 0.7, 0.08);
  },
  streamStop: () => {
    bell(N.C6, 0, 0.35, 0.08);
    bell(N.G5, 0.1, 0.35, 0.09);
    bell(N.C5, 0.2, 0.7, 0.09);
  },
  hangup: () => {
    bell(N.E5, 0, 0.35, 0.1);
    bell(N.A4, 0.12, 0.7, 0.1);
  },
};

export function sfx(name) {
  if (!prefs.sounds) return;
  try {
    SFX[name]?.();
  } catch {}
}

let ringTimer = null;
export function startRing() {
  stopRing();
  const ring = () => {
    if (!prefs.sounds) return;
    // ruhige, freundliche Klingel-Melodie
    [[N.E5, 0], [N.G5, 0.22], [N.C6, 0.44], [N.G5, 0.9], [N.C6, 1.12]].forEach(([f, t]) => bell(f, t, 0.7, 0.1));
  };
  ring();
  ringTimer = setInterval(ring, 3500);
  setTimeout(stopRing, 45000);
}
export function stopRing() {
  clearInterval(ringTimer);
  ringTimer = null;
}
