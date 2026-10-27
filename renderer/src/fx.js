// Kleine UI-Effekte: Klick-Wellen, Licht unter dem Mauszeiger, sanfte Übergänge.
// Alles läuft außerhalb von Preact (eigene Elemente bzw. Web Animations), damit nichts am Rendern hängt.
import { prefs } from './store';

const RIPPLE = '.btn, .ibtn, .nav-item, .dm-item, .menu-item, .member, .stab, .chan, .frow, .opt, .spack, .gs-act, .fchip, .ptabs button, .ftab, .settings nav button, .pick-row, .sev';
const SPOT = '.spack, .gs-act, .opt, .frow, .sev';

const calm = () => prefs.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

// Welle beim Klicken: liegt als eigenes, festes Element über dem Ziel und räumt sich selbst auf
function ripple(e) {
  if (e.button !== 0 || calm()) return;
  const el = e.target.closest?.(RIPPLE);
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const host = document.createElement('span');
  host.className = 'ripple-host';
  Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: getComputedStyle(el).borderRadius });
  const size = Math.hypot(r.width, r.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  Object.assign(dot.style, { width: size + 'px', height: size + 'px', left: e.clientX - r.left - size / 2 + 'px', top: e.clientY - r.top - size / 2 + 'px' });
  host.appendChild(dot);
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 650);
}

// Licht folgt der Maus auf Karten (setzt nur zwei CSS-Variablen)
let spotEl = null;
function spot(e) {
  const el = e.target.closest?.(SPOT);
  if (spotEl && spotEl !== el) spotEl.classList.remove('spot-on');
  spotEl = el;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', e.clientX - r.left + 'px');
  el.style.setProperty('--my', e.clientY - r.top + 'px');
  el.classList.add('spot-on');
}

// Werkzeugleiste einer Nachricht im sichtbaren Bereich der Liste halten – bei kurzen Nachrichten ragt sie
// sonst hinaus, wird abgeschnitten und der Browser scrollt die Liste seitlich
let toolsEl = null;
function clampTools(e) {
  const msg = e.target.closest?.('.msg');
  const t = msg && [...msg.children].find((c) => c.classList.contains('msg-tools'));
  if (!t || t === toolsEl) return;
  toolsEl = t;
  t.style.removeProperty('--tx');
  const list = msg.closest('.msgs');
  if (!list || !t.offsetWidth) return;
  const box = list.getBoundingClientRect();
  const left = msg.getBoundingClientRect().left + t.offsetLeft;
  const right = left + t.offsetWidth;
  const dx = left < box.left + 6 ? box.left + 6 - left : right > box.right - 6 ? box.right - 6 - right : 0;
  if (dx) t.style.setProperty('--tx', Math.round(dx) + 'px');
}

export function initFx() {
  document.addEventListener('pointerdown', ripple, { passive: true });
  document.addEventListener('pointermove', spot, { passive: true });
  document.addEventListener('pointerover', clampTools, { passive: true });
}

// Inhalt beim Wechsel (Kanal, Einstellungs-Seite) kurz einblenden
export function fadeIn(el, dy = 8) {
  if (!el || calm() || !el.animate) return;
  el.animate([{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.25,.8,.25,1)' });
}

// Theme-/Farbwechsel: neue Farben breiten sich kreisförmig vom Klickpunkt aus (View Transitions), sonst sofort
export function withTransition(fn, e) {
  if (!document.startViewTransition || calm()) return fn();
  const root = document.documentElement.style;
  root.setProperty('--vtx', (e?.clientX ?? innerWidth / 2) + 'px');
  root.setProperty('--vty', (e?.clientY ?? innerHeight / 2) + 'px');
  document.startViewTransition(
    () =>
      new Promise((resolve) => {
        fn();
        // Preact rendert per Microtask; während der Transition laufen keine Frames, also kein rAF
        setTimeout(resolve, 20);
      })
  );
}
