// Animierte Profil-Effekte und Avatar-Dekorationen auf einem Canvas: flüssige Partikel mit Leuchten, Schwerkraft,
// Wind und Tiefe – deutlich feiner als Emoji-/CSS-Partikel. Jede Szene hat init(s) und frame(ctx, s, dt).
// Läuft nur, solange der Canvas sichtbar ist; bei „Animationen reduzieren“ bleibt ein ruhiges Standbild.
import { useEffect, useRef } from 'preact/hooks';
import { prefs } from './store';

const TAU = Math.PI * 2;
const R = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const calm = () => prefs.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

// weicher Leuchtpunkt (vorgerendert je Farbe, sonst wären hunderte Verläufe pro Bild zu teuer)
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color);
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
function glow(ctx, x, y, r, color, a = 1) {
  ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
const hsl = (h, s = 100, l = 60) => `hsl(${Math.round(h) % 360} ${s}% ${l}%)`;

// Zickzack-Blitz (Mittelpunkt-Verschiebung) mit Abzweigungen
function bolt(x1, y1, x2, y2, rough, depth, out) {
  if (depth <= 0) {
    out.push([x1, y1, x2, y2]);
    return;
  }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * rough;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * rough;
  bolt(x1, y1, mx, my, rough / 2, depth - 1, out);
  bolt(mx, my, x2, y2, rough / 2, depth - 1, out);
  if (depth > 2 && Math.random() < 0.3) bolt(mx, my, mx + (Math.random() - 0.3) * rough * 1.5, my + rough, rough / 2, depth - 2, out);
}
function drawBolt(ctx, segs, a, color) {
  ctx.lineCap = 'round';
  for (const [w, al] of [[6, 0.18], [2.5, 0.5], [1, 1]]) {
    ctx.strokeStyle = w === 1 ? '#fff' : color;
    ctx.globalAlpha = a * al;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segs) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Blütenblatt (gedreht, mit „Kippen“ für den 3D-Eindruck)
function petal(ctx, x, y, size, rot, flip, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(Math.max(0.15, Math.abs(Math.cos(flip))), 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.9, -size * 0.6, size * 0.7, size * 0.6, 0, size);
  ctx.bezierCurveTo(-size * 0.7, size * 0.6, -size * 0.9, -size * 0.6, 0, -size);
  ctx.fill();
  ctx.restore();
}
function heart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.45, y - s, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.4, x, y + s * 0.35);
  ctx.fill();
}

// ---------- Profil-Effekte (ganze Profilkarte) ----------
export const CARD_SCENES = {
  fireworks: {
    name: 'Feuerwerk',
    init(s) {
      s.rockets = [];
      s.sparks = [];
      s.next = 0.3;
    },
    frame(ctx, s, dt) {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = R(0.35, 0.8) * (s.small ? 1.4 : 1);
        s.rockets.push({ x: R(s.w * 0.15, s.w * 0.85), y: s.h + 4, vx: R(-20, 20), vy: -R(s.h * 0.9, s.h * 1.25), hue: R(360), fuse: R(0.55, 0.9) });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const r of s.rockets) {
        r.fuse -= dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.vy += s.h * 0.6 * dt;
        glow(ctx, r.x, r.y, 6, hsl(r.hue, 100, 75));
        if (r.fuse <= 0) {
          r.dead = true;
          const n = s.small ? 30 : 80;
          const ring = Math.random() < 0.3;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + R(0.1);
            const sp = ring ? s.h * 0.6 : R(s.h * 0.2, s.h * 0.7);
            s.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: R(0.6, 1), hue: r.hue + R(-25, 25) });
          }
        }
      }
      s.rockets = s.rockets.filter((r) => !r.dead);
      for (const p of s.sparks) {
        p.vx *= 1 - 1.4 * dt;
        p.vy = p.vy * (1 - 1.4 * dt) + s.h * 0.35 * dt;
        const ox = p.x;
        const oy = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        ctx.strokeStyle = hsl(p.hue, 100, 65);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(ox - p.vx * 0.05, oy - p.vy * 0.05);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        glow(ctx, p.x, p.y, 5, hsl(p.hue, 100, 70), Math.max(0, p.life) * 0.5);
      }
      ctx.globalAlpha = 1;
      s.sparks = s.sparks.filter((p) => p.life > 0);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  aurora: {
    name: 'Nordlicht',
    init(s) {
      s.bands = [
        { y: 0.18, amp: 0.06, f: 1.6, sp: 0.35, h: 150, len: 0.5 },
        { y: 0.28, amp: 0.05, f: 2.3, sp: -0.25, h: 185, len: 0.42 },
        { y: 0.12, amp: 0.04, f: 3.1, sp: 0.5, h: 290, len: 0.3 },
      ];
      s.stars = Array.from({ length: s.small ? 14 : 40 }, () => ({ x: R(), y: R(0.7), p: R(TAU) }));
    },
    frame(ctx, s) {
      for (const st of s.stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(s.t * 2 + st.p);
        ctx.fillStyle = '#fff';
        ctx.fillRect(st.x * s.w, st.y * s.h, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      const step = s.small ? 6 : 4;
      for (const b of s.bands) {
        const hue = b.h + Math.sin(s.t * 0.3) * 20;
        for (let x = 0; x <= s.w; x += step) {
          const u = x / s.w;
          const y = s.h * (b.y + b.amp * Math.sin(u * TAU * b.f * 0.5 + s.t * b.sp * 3) + b.amp * 0.6 * Math.sin(u * TAU * b.f + s.t * b.sp * 5));
          const len = s.h * b.len * (0.7 + 0.3 * Math.sin(u * 9 + s.t * 1.3));
          const a = 0.16 + 0.12 * Math.sin(u * 14 - s.t * 2);
          const g = ctx.createLinearGradient(0, y, 0, y + len);
          g.addColorStop(0, `hsla(${hue}, 100%, 70%, ${a})`);
          g.addColorStop(0.25, `hsla(${hue + 20}, 100%, 55%, ${a * 0.7})`);
          g.addColorStop(1, 'hsla(0,0%,0%,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, step + 0.5, len);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  galaxy: {
    name: 'Galaxienwirbel',
    init(s) {
      const n = s.small ? 140 : 420;
      s.stars = Array.from({ length: n }, () => {
        const arm = Math.floor(R(3));
        const r = Math.pow(R(), 0.6);
        return { r, a: arm * (TAU / 3) + r * 4.2 + R(-0.35, 0.35) * (1.2 - r), hue: R() < 0.7 ? R(200, 260) : R(290, 340), size: R(0.6, 1.6), tw: R(TAU) };
      });
    },
    frame(ctx, s) {
      const cx = s.w * 0.5;
      const cy = s.h * 0.32;
      const rad = Math.max(s.w, s.h) * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, rad * 0.35, 'rgba(180,140,255,0.55)');
      glow(ctx, cx, cy, rad * 0.12, 'rgba(255,240,220,0.9)');
      for (const st of s.stars) {
        const a = st.a + s.t * (0.25 / (0.25 + st.r));
        const x = cx + Math.cos(a) * st.r * rad;
        const y = cy + Math.sin(a) * st.r * rad * 0.45;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(s.t * 3 + st.tw);
        ctx.fillStyle = hsl(st.hue, 90, 80);
        ctx.fillRect(x, y, st.size, st.size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  meteors: {
    name: 'Sternschnuppen',
    init(s) {
      s.stars = Array.from({ length: s.small ? 20 : 60 }, () => ({ x: R(), y: R(), p: R(TAU), r: R(0.5, 1.4) }));
      s.meteors = [];
      s.next = 0.2;
    },
    frame(ctx, s, dt) {
      for (const st of s.stars) {
        ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(s.t * 2.5 + st.p));
        ctx.fillStyle = '#e8eeff';
        ctx.beginPath();
        ctx.arc(st.x * s.w, st.y * s.h, st.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      s.next -= dt;
      if (s.next <= 0) {
        s.next = R(0.6, 1.8);
        const sp = R(s.w * 1.2, s.w * 2);
        s.meteors.push({ x: R(s.w * 0.2, s.w * 1.1), y: R(-s.h * 0.1, s.h * 0.35), vx: -sp * 0.82, vy: sp * 0.45, life: 1 });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const m of s.meteors) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life -= dt * 0.9;
        const tx = m.x - m.vx * 0.12;
        const ty = m.y - m.vy * 0.12;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${m.life})`);
        g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        glow(ctx, m.x, m.y, 7, 'rgba(200,225,255,1)', m.life);
      }
      ctx.globalCompositeOperation = 'source-over';
      s.meteors = s.meteors.filter((m) => m.life > 0 && m.x > -60);
    },
  },
  fireflies: {
    name: 'Glühwürmchen-Schwarm',
    init(s) {
      s.f = Array.from({ length: s.small ? 12 : 30 }, () => ({ x: R(s.w), y: R(s.h), a: R(TAU), sp: R(10, 26), p: R(TAU), ps: R(1.5, 3) }));
    },
    frame(ctx, s, dt) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of s.f) {
        f.a += (Math.sin(s.t * 0.7 + f.p) * 1.8 + R(-1, 1)) * dt;
        f.x = (f.x + Math.cos(f.a) * f.sp * dt + s.w) % s.w;
        f.y = (f.y + Math.sin(f.a) * f.sp * dt + s.h) % s.h;
        const b = Math.max(0, Math.sin(s.t * f.ps + f.p));
        glow(ctx, f.x, f.y, 14 + 10 * b, 'rgba(190,255,90,0.55)', 0.25 + 0.75 * b);
        glow(ctx, f.x, f.y, 3, 'rgba(255,255,200,1)', 0.4 + 0.6 * b);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  lightning: {
    name: 'Blitzsturm',
    init(s) {
      s.next = 0.4;
      s.bolts = [];
      s.flash = 0;
      s.rain = Array.from({ length: s.small ? 20 : 60 }, () => ({ x: R(s.w), y: R(s.h), sp: R(380, 620), l: R(8, 16) }));
    },
    frame(ctx, s, dt) {
      ctx.strokeStyle = 'rgba(170,200,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of s.rain) {
        d.y += d.sp * dt;
        d.x -= d.sp * 0.12 * dt;
        if (d.y > s.h) (d.y = -d.l), (d.x = R(s.w * 1.2));
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.l * 0.12, d.y - d.l);
      }
      ctx.stroke();
      s.next -= dt;
      if (s.next <= 0) {
        s.next = R(1.2, 3);
        const segs = [];
        const x = R(s.w * 0.15, s.w * 0.85);
        bolt(x, -4, x + R(-s.w * 0.25, s.w * 0.25), s.h * R(0.55, 0.95), s.w * 0.22, s.small ? 5 : 7, segs);
        s.bolts.push({ segs, life: 1 });
        s.flash = 1;
      }
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(190,210,255,${s.flash * 0.28})`;
        ctx.fillRect(0, 0, s.w, s.h);
        s.flash -= dt * 3;
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.bolts) {
        b.life -= dt * 2.2;
        const flick = b.life > 0.5 || Math.random() > 0.4 ? 1 : 0.3;
        drawBolt(ctx, b.segs, Math.max(0, b.life) * flick, 'rgb(150,180,255)');
      }
      ctx.globalCompositeOperation = 'source-over';
      s.bolts = s.bolts.filter((b) => b.life > 0);
    },
  },
  blizzard: {
    name: 'Schneegestöber',
    init(s) {
      s.flakes = Array.from({ length: s.small ? 40 : 110 }, () => ({ x: R(s.w), y: R(s.h), z: R(0.3, 1.4), p: R(TAU) }));
    },
    frame(ctx, s, dt) {
      const wind = Math.sin(s.t * 0.5) * 40 + Math.sin(s.t * 1.7) * 15;
      for (const f of s.flakes) {
        f.y += (18 + 38 * f.z) * dt;
        f.x += (wind * f.z + Math.sin(s.t * 1.5 + f.p) * 12) * dt;
        if (f.y > s.h + 10) (f.y = -10), (f.x = R(s.w));
        if (f.x > s.w + 10) f.x = -10;
        if (f.x < -10) f.x = s.w + 10;
        if (f.z > 1.15) glow(ctx, f.x, f.y, 6 * f.z, 'rgba(255,255,255,0.6)', 0.5);
        else {
          ctx.globalAlpha = 0.35 + f.z * 0.45;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.z * 1.8, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  sakurawind: {
    name: 'Sakura-Wind',
    init(s) {
      s.p = Array.from({ length: s.small ? 12 : 34 }, () => ({ x: R(s.w), y: R(-s.h, s.h), sz: R(4, 8), rot: R(TAU), vr: R(-2, 2), flip: R(TAU), vf: R(2, 5), sp: R(22, 46), c: pick(['#ffc0d9', '#ffb3cf', '#ffd6e6', '#ff9ec4']) }));
    },
    frame(ctx, s, dt) {
      const wind = 25 + Math.sin(s.t * 0.6) * 20;
      for (const p of s.p) {
        p.y += p.sp * dt;
        p.x += (wind + Math.sin(s.t * 2 + p.flip) * 14) * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        if (p.y > s.h + 12 || p.x > s.w + 12) (p.y = R(-30, -10)), (p.x = R(-s.w * 0.3, s.w));
        petal(ctx, p.x, p.y, p.sz, p.rot, p.flip, p.c);
      }
    },
  },
  matrixrain: {
    name: 'Matrix-Code',
    init(s) {
      s.cols = [];
      const fs = s.small ? 9 : 13;
      s.fs = fs;
      for (let x = 0; x < s.w; x += fs) s.cols.push({ x, y: R(-s.h, 0), sp: R(50, 130), chars: [] });
    },
    frame(ctx, s, dt) {
      ctx.font = `${s.fs}px monospace`;
      ctx.textAlign = 'center';
      for (const c of s.cols) {
        c.y += c.sp * dt;
        const row = Math.floor(c.y / s.fs);
        if (row !== c.row) {
          c.row = row;
          c.chars.push({ ch: String.fromCharCode(0x30a0 + Math.floor(R(96))), y: row * s.fs, age: 0 });
          if (c.chars.length > 18) c.chars.shift();
        }
        for (const ch of c.chars) {
          ch.age += dt;
          const head = ch === c.chars[c.chars.length - 1];
          ctx.fillStyle = head ? '#eaffea' : `rgba(60,255,120,${Math.max(0, 0.9 - ch.age * 0.45)})`;
          if (!head && Math.random() < 0.01) ch.ch = String.fromCharCode(0x30a0 + Math.floor(R(96)));
          ctx.fillText(ch.ch, c.x + s.fs / 2, ch.y);
        }
        if (c.y > s.h + s.fs * 18) (c.y = R(-s.h * 0.5, 0)), (c.chars = []), (c.sp = R(50, 130));
      }
    },
  },
  bubbles3d: {
    name: 'Schillernde Blasen',
    init(s) {
      s.b = Array.from({ length: s.small ? 6 : 14 }, () => ({ x: R(s.w), y: R(s.h, s.h * 2), r: R(6, 18), sp: R(16, 36), p: R(TAU), h: R(360) }));
      s.drops = [];
    },
    frame(ctx, s, dt) {
      for (const b of s.b) {
        b.y -= b.sp * dt;
        b.x += Math.sin(s.t * 1.4 + b.p) * 14 * dt;
        b.h += 40 * dt;
        if (b.y < s.h * R(0.05, 0.25) && Math.random() < 0.02) {
          for (let i = 0; i < 8; i++) s.drops.push({ x: b.x, y: b.y, vx: Math.cos((i / 8) * TAU) * 40, vy: Math.sin((i / 8) * TAU) * 40, life: 0.5 });
          Object.assign(b, { y: s.h + b.r + R(40), x: R(s.w) });
        }
        const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(255,255,255,0.05)');
        g.addColorStop(0.75, `hsla(${b.h % 360}, 100%, 75%, 0.12)`);
        g.addColorStop(0.92, `hsla(${(b.h + 120) % 360}, 100%, 70%, 0.55)`);
        g.addColorStop(1, `hsla(${(b.h + 200) % 360}, 100%, 70%, 0.1)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.ellipse(b.x - b.r * 0.38, b.y - b.r * 0.42, b.r * 0.22, b.r * 0.12, -0.6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(220,240,255,0.8)';
      for (const d of s.drops) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 80 * dt;
        d.life -= dt;
        ctx.globalAlpha = Math.max(0, d.life * 2);
        ctx.fillRect(d.x, d.y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      s.drops = s.drops.filter((d) => d.life > 0);
    },
  },
  lovesparks: {
    name: 'Liebesfunken',
    init(s) {
      s.h_ = Array.from({ length: s.small ? 8 : 18 }, () => ({ x: R(s.w), y: R(s.h), sz: R(5, 11), sp: R(14, 30), p: R(TAU), c: pick(['#ff4d8d', '#ff7aa8', '#ff2e63', '#ffb3c8']) }));
    },
    frame(ctx, s, dt) {
      ctx.globalCompositeOperation = 'lighter';
      for (const h of s.h_) {
        h.y -= h.sp * dt;
        if (h.y < -20) (h.y = s.h + 20), (h.x = R(s.w));
        const x = h.x + Math.sin(s.t * 1.5 + h.p) * 10;
        const beat = 1 + 0.12 * Math.max(0, Math.sin(s.t * 6 + h.p));
        glow(ctx, x, h.y, h.sz * 2.6, 'rgba(255,60,130,0.5)', 0.5);
        heart(ctx, x, h.y, h.sz * beat, h.c);
        if (Math.random() < 0.05) glow(ctx, x + R(-12, 12), h.y + R(-12, 12), 3, 'rgba(255,220,240,1)');
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  inferno: {
    name: 'Feuersturm',
    init(s) {
      s.p = [];
    },
    frame(ctx, s, dt) {
      const n = Math.round((s.small ? 50 : 100) * dt * 5);
      // in kleinen Vorschauen kleinere Flammen, sonst überstrahlt alles
      const k = Math.min(1, s.w / 300 + 0.25);
      for (let i = 0; i < n * k; i++) s.p.push({ x: R(s.w), y: s.h + 6, vx: R(-12, 12), vy: -R(40, 110) * k, life: 1, decay: R(0.55, 1.1), r: R(6, 16) * k });
      ctx.globalCompositeOperation = 'lighter';
      for (const p of s.p) {
        p.x += (p.vx + Math.sin(s.t * 3 + p.y * 0.05) * 10) * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        const l = Math.max(0, p.life);
        const col = l > 0.7 ? 'rgba(255,240,180,0.9)' : l > 0.4 ? 'rgba(255,150,40,0.8)' : 'rgba(220,50,20,0.6)';
        glow(ctx, p.x, p.y, p.r * (0.4 + l * 0.8), col, l * 0.7);
      }
      ctx.globalCompositeOperation = 'source-over';
      s.p = s.p.filter((p) => p.life > 0);
    },
  },
  confettiburst: {
    name: 'Konfetti-Kanone',
    init(s) {
      s.c = [];
      s.next = 0;
    },
    frame(ctx, s, dt) {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = R(1.1, 1.7);
        for (const side of [0, 1]) {
          const n = s.small ? 18 : 40;
          for (let i = 0; i < n; i++) {
            const a = side ? R(-2.55, -2.05) : R(-1.1, -0.6);
            const sp = R(s.h * 0.7, s.h * 1.25);
            s.c.push({ x: side ? s.w : 0, y: s.h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: R(TAU), vr: R(-8, 8), flip: R(TAU), vf: R(5, 12), w: R(4, 7), h: R(7, 11), col: hsl(R(360), 90, 62), life: R(2.5, 3.5) });
          }
        }
      }
      for (const p of s.c) {
        p.vx *= 1 - 1.6 * dt;
        p.vy = p.vy * (1 - 1.6 * dt) + s.h * 0.55 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        p.life -= dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip));
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      s.c = s.c.filter((p) => p.life > 0 && p.y < s.h + 30);
    },
  },
  underwater: {
    name: 'Unterwasser',
    init(s) {
      s.bub = Array.from({ length: s.small ? 10 : 26 }, () => ({ x: R(s.w), y: R(s.h), r: R(1, 3.5), sp: R(15, 40), p: R(TAU) }));
    },
    frame(ctx, s, dt) {
      const g = ctx.createLinearGradient(0, 0, 0, s.h);
      g.addColorStop(0, 'rgba(40,190,255,0.22)');
      g.addColorStop(1, 'rgba(0,40,90,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.w, s.h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = s.w * (i / 5) + Math.sin(s.t * 0.4 + i * 1.7) * s.w * 0.12;
        const a = 0.05 + 0.04 * Math.sin(s.t * 0.9 + i);
        const rg = ctx.createLinearGradient(0, 0, 0, s.h);
        rg.addColorStop(0, `rgba(180,240,255,${a})`);
        rg.addColorStop(1, 'rgba(180,240,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(x - 10, 0);
        ctx.lineTo(x + 14, 0);
        ctx.lineTo(x + 50, s.h);
        ctx.lineTo(x - 30, s.h);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(220,250,255,0.7)';
      ctx.lineWidth = 1;
      for (const b of s.bub) {
        b.y -= b.sp * dt;
        b.x += Math.sin(s.t * 2 + b.p) * 8 * dt;
        if (b.y < -6) (b.y = s.h + 6), (b.x = R(s.w));
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.stroke();
      }
    },
  },
};

// ---------- Avatar-Dekorationen (Canvas reicht über den Avatar hinaus) ----------
// Mittelpunkt (cx, cy) und Avatar-Radius r ergeben sich aus der Canvas-Größe (siehe .cvdeco in styles.css).
const ring = (s) => ({ cx: s.w / 2, cy: s.h / 2, r: s.w / 2 / 1.7 });
export const DECO_SCENES = {
  flamering: {
    name: 'Flammenkranz',
    init(s) {
      s.p = [];
    },
    frame(ctx, s, dt) {
      const { cx, cy, r } = ring(s);
      for (let i = 0; i < 160 * dt * 4; i++) {
        const a = R(TAU);
        s.p.push({ x: cx + Math.cos(a) * r * 1.02, y: cy + Math.sin(a) * r * 1.02, vx: Math.cos(a) * 6, vy: -R(20, 55) * (r / 40), life: 1, decay: R(1.2, 2.2), rr: R(0.12, 0.22) * r });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of s.p) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        const l = Math.max(0, p.life);
        glow(ctx, p.x, p.y, p.rr * (0.5 + l), l > 0.6 ? 'rgba(255,230,150,0.9)' : l > 0.3 ? 'rgba(255,130,30,0.8)' : 'rgba(200,40,20,0.6)', l * 0.6);
      }
      ctx.globalCompositeOperation = 'source-over';
      s.p = s.p.filter((p) => p.life > 0);
    },
  },
  orbitals: {
    name: 'Lichtorbit',
    init(s) {
      s.o = [
        { tilt: 0.35, rot: 0.4, sp: 1.6, h: 190, ph: 0 },
        { tilt: 0.3, rot: -0.9, sp: -1.25, h: 300, ph: 2 },
        { tilt: 0.45, rot: 1.6, sp: 1.05, h: 45, ph: 4 },
      ];
    },
    frame(ctx, s) {
      const { cx, cy, r } = ring(s);
      ctx.globalCompositeOperation = 'lighter';
      // hinten zuerst, damit die Kometen vor dem Avatar größer und heller wirken
      for (const o of s.o) {
        for (let k = 26; k >= 0; k--) {
          const a = (s.t - k * 0.018) * o.sp + o.ph;
          const ex = Math.cos(a) * r * 1.38;
          const ey = Math.sin(a) * r * 1.38 * o.tilt;
          const x = cx + ex * Math.cos(o.rot) - ey * Math.sin(o.rot);
          const y = cy + ex * Math.sin(o.rot) + ey * Math.cos(o.rot);
          const depth = 0.55 + 0.45 * Math.sin(a);
          const fade = 1 - k / 27;
          glow(ctx, x, y, r * (k ? 0.11 : 0.26) * (0.6 + depth), hsl(o.h, 100, k ? 62 : 85), fade * (0.45 + 0.55 * depth));
          if (!k) glow(ctx, x, y, r * 0.07, '#fff', 0.6 + 0.4 * depth);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  plasma: {
    name: 'Plasmaring',
    init(s) {
      s.arcs = [];
      s.next = 0;
    },
    frame(ctx, s, dt) {
      const { cx, cy, r } = ring(s);
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(s.t * 5);
      for (const [w, a] of [[0.22, 0.12], [0.1, 0.3], [0.035, 0.9]]) {
        ctx.strokeStyle = `rgba(120,170,255,${a * pulse})`;
        ctx.lineWidth = r * w;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.06, 0, TAU);
        ctx.stroke();
      }
      s.next -= dt;
      if (s.next <= 0) {
        s.next = R(0.03, 0.1);
        const a1 = R(TAU);
        const a2 = a1 + R(0.6, 1.6);
        const segs = [];
        bolt(cx + Math.cos(a1) * r * 1.06, cy + Math.sin(a1) * r * 1.06, cx + Math.cos(a2) * r * 1.06, cy + Math.sin(a2) * r * 1.06, r * 0.5, 5, segs);
        s.arcs.push({ segs, life: 1 });
      }
      for (const a of s.arcs) {
        a.life -= dt * 3.5;
        drawBolt(ctx, a.segs, Math.max(0, a.life), 'rgb(140,190,255)');
      }
      s.arcs = s.arcs.filter((a) => a.life > 0);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  starswirl: {
    name: 'Sternenwirbel',
    init(s) {
      s.st = Array.from({ length: 70 }, () => ({ a: R(TAU), d: R(1.05, 1.5), sp: R(0.5, 1.4), sz: R(0.6, 1.8), h: R(200, 320) }));
    },
    frame(ctx, s, dt) {
      const { cx, cy, r } = ring(s);
      ctx.globalCompositeOperation = 'lighter';
      for (const st of s.st) {
        st.a += st.sp * dt * (1.6 - st.d * 0.6);
        const x = cx + Math.cos(st.a) * r * st.d;
        const y = cy + Math.sin(st.a) * r * st.d;
        glow(ctx, x, y, r * 0.06 * st.sz, hsl(st.h, 90, 75), 0.8);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  petalring: {
    name: 'Blütenwirbel',
    init(s) {
      s.p = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU, d: R(1.1, 1.45), rot: R(TAU), flip: R(TAU), sz: R(0.1, 0.16), c: pick(['#ffc0d9', '#ffb3cf', '#ff9ec4', '#fff0f6']) }));
    },
    frame(ctx, s, dt) {
      const { cx, cy, r } = ring(s);
      for (const p of s.p) {
        p.a += dt * 0.7;
        p.rot += dt * 1.5;
        p.flip += dt * 3;
        const d = p.d + Math.sin(s.t * 1.3 + p.a * 3) * 0.06;
        petal(ctx, cx + Math.cos(p.a) * r * d, cy + Math.sin(p.a) * r * d, p.sz * r, p.rot, p.flip, p.c);
      }
    },
  },
  frostring: {
    name: 'Eiskristallkranz',
    init(s) {
      s.c = Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * TAU, sz: R(0.12, 0.2), sp: R(0.8, 1.6) }));
      s.sp = [];
    },
    frame(ctx, s, dt) {
      const { cx, cy, r } = ring(s);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, r * 1.45, 'rgba(120,200,255,0.25)', 0.6);
      ctx.strokeStyle = 'rgba(210,240,255,0.9)';
      ctx.lineWidth = Math.max(1, r * 0.025);
      for (const c of s.c) {
        c.a += dt * 0.3;
        const x = cx + Math.cos(c.a) * r * 1.2;
        const y = cy + Math.sin(c.a) * r * 1.2;
        const sz = c.sz * r * (0.85 + 0.15 * Math.sin(s.t * c.sp * 3));
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + s.t * 0.5;
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * sz, y + Math.sin(a) * sz);
          const bx = x + Math.cos(a) * sz * 0.55;
          const by = y + Math.sin(a) * sz * 0.55;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a + 0.7) * sz * 0.3, by + Math.sin(a + 0.7) * sz * 0.3);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a - 0.7) * sz * 0.3, by + Math.sin(a - 0.7) * sz * 0.3);
        }
        ctx.stroke();
        if (Math.random() < dt * 2) s.sp.push({ x, y, life: 1 });
      }
      for (const p of s.sp) {
        p.life -= dt * 1.5;
        glow(ctx, p.x, p.y, r * 0.12 * p.life, 'rgba(230,250,255,1)', p.life);
      }
      s.sp = s.sp.filter((p) => p.life > 0);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
};

// ---------- Canvas mit Animationsschleife ----------
export function FxCanvas({ scene, deco, cls }) {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current;
    const sc = (deco ? DECO_SCENES : CARD_SCENES)[scene];
    if (!cv || !sc) return;
    const ctx = cv.getContext('2d');
    const s = { w: 0, h: 0, t: 0, small: false };
    let small = false; // kleine Vorschau: weniger Teilchen, halbe Bildrate
    let raf = 0;
    let last = 0;
    let visible = false;
    let ready = false;
    let skip = false;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      small = s.small = !deco && r.width < 220;
      const dpr = Math.min(2, window.devicePixelRatio || 1) * (small ? 0.75 : 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const changed = Math.abs(s.w - r.width) > 1 || Math.abs(s.h - r.height) > 1;
      s.w = r.width;
      s.h = r.height;
      if (!ready || changed) {
        sc.init(s);
        // kurz vorlaufen lassen, damit die Szene nicht leer beginnt
        for (let i = 0; i < 45; i++) ctx.clearRect(0, 0, s.w, s.h), (s.t += 1 / 30), sc.frame(ctx, s, 1 / 30);
        ready = true;
      }
      return true;
    };
    const draw = (dt) => {
      ctx.clearRect(0, 0, s.w, s.h);
      s.t += dt;
      sc.frame(ctx, s, dt);
    };
    const loop = (now) => {
      raf = 0;
      if (!visible || document.hidden || !ready) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      // kleine Vorschauen mit halber Bildrate
      if (small && (skip = !skip)) return (raf = requestAnimationFrame(loop));
      last = now;
      draw(small ? Math.min(0.08, dt * 2) : dt);
      if (!calm()) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (raf || !visible || document.hidden) return;
      if (!ready && !fit()) return;
      last = performance.now();
      if (calm()) return draw(0);
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    });
    const ro = new ResizeObserver(() => {
      if (fit()) kick();
    });
    io.observe(cv);
    ro.observe(cv);
    document.addEventListener('visibilitychange', kick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', kick);
    };
  }, [scene, deco]);
  return <canvas ref={ref} class={cls} aria-hidden="true" />;
}
