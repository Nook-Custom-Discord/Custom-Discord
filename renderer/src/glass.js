// Liquid Glass: Lichtbrechung an den Kanten von Glasflächen + Lichtreflex unter dem Mauszeiger.
// Für jede Elementgröße entsteht ein SVG-Filter mit einer Verschiebungskarte (Displacement-Map). Als
// backdrop-filter zieht er den Hintergrund am Rand nach innen – wie der Rand einer gewölbten Glaslinse.
// SVG-Filter als backdrop-filter kann nur Chromium (Electron, Chrome, Edge); sonst bleibt es beim Weichzeichner.
import { prefs, setPref, update } from './store';

// Glasflächen mit Lichtbrechung: alles, was über wechselndem Inhalt schwebt (Hintergrund, Nachrichten,
// übrige Oberfläche). Die großen Panels sind bewusst nicht dabei (nur Weichzeichner) – spart Grafikleistung.
const REFRACT = [
  '.topbar .logo-btn',
  '.topbar .sdock',
  '.topbar .search-pill',
  '.topbar .me-chip',
  '.content > .chead',
  '.composer',
  '.autocomplete',
  '.jump-btn',
  '.msg-tools',
  '.stage-bar',
  '.menu',
  '.modal',
  '.popout .pcard:not(.themed)',
  '.picker',
  '.toast',
  '.incoming',
  '.login .box',
  '.settings nav .inner',
  '.lg-demo .lg-glass',
].join(',');
// Flächen, über die beim Hovern ein Lichtreflex wandert (Gegenstück in styles.css, Abschnitt „Liquid Glass“)
const SHINE = REFRACT + ', .user-dock, .card, .reaction';

// Stärke je Variante: Weichzeichner im Glas, Breite der gewölbten Kante, maximale Verschiebung, Sättigung
const LOOK = {
  tinted: { blur: 7, bezel: 20, shift: 16, sat: 1.8 },
  clear: { blur: 1.5, bezel: 24, shift: 24, sat: 1.5 },
};

// nur Chromium-Engines (Electron, Chrome, Edge, Opera …) rendern SVG-Filter als backdrop-filter
export function refractionSupported() {
  if (window.nook?.isElectron) return true;
  const ua = navigator.userAgent;
  return /Chrome\/|Chromium\//.test(ua) && !/Firefox|FxiOS|CriOS|EdgiOS/.test(ua) && CSS.supports?.('backdrop-filter', 'url(#a)') === true;
}

let mode = ''; // aktive Variante ('' = aus)
let refract = false;
// eingestellte Faktoren (Regler „Unschärfe“ und „Lichtbrechung“, 1 = Standard) – ändern sie sich, werden die Filter neu gebaut
let blurK = 1;
let shiftK = 1;
let rebuildT = 0;
let ro = null;
let mo = null;
let host = null;
let seq = 0;
const filters = new Map(); // Schlüssel -> { id, node, uses }
const applied = new Map(); // Element -> Schlüssel
const pending = new Set();
let raf = 0;

function svgHost() {
  if (host?.isConnected) return host;
  host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  return host;
}

// Verschiebungskarte für ein abgerundetes Rechteck: Rot = x, Grün = y, 128 = keine Verschiebung.
// Innerhalb der Kante (bezel) zeigt jeder Punkt Hintergrund von weiter innen – am Rand am stärksten.
const maps = new Map(); // Größe/Radius/Kante -> Bild (bleibt beim Neuaufbau der Filter erhalten)
function displacementMap(w, h, r, bezel) {
  const mk = `${w}x${h}r${Math.round(r)}z${bezel}`;
  let url = maps.get(mk);
  if (!url) {
    url = drawMap(w, h, r, bezel);
    if (maps.size > 80) maps.delete(maps.keys().next().value);
    maps.set(mk, url);
  }
  return url;
}
function drawMap(w, h, r, bezel) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const a = w / 2;
  const b = h / 2;
  r = Math.max(0, Math.min(r, a, b));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = x + 0.5 - a;
      const py = y + 0.5 - b;
      const qx = Math.abs(px) - (a - r);
      const qy = Math.abs(py) - (b - r);
      let dist;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        dist = r - l;
        nx = qx / l;
        ny = qy / l;
      } else if (qx > qy) {
        dist = a - Math.abs(px);
        nx = 1;
      } else {
        dist = b - Math.abs(py);
        ny = 1;
      }
      nx *= px < 0 ? -1 : 1;
      ny *= py < 0 ? -1 : 1;
      // Kantenprofil: steil am Rand, flach zur Mitte (wie eine abgerundete Glasplatte)
      const t = dist < bezel ? 1 - Math.max(0, dist) / bezel : 0;
      const m = t * t * (3 - 2 * t);
      d[i] = 128 - nx * m * 127;
      d[i + 1] = 128 - ny * m * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// blur: Weichzeichner im Glas (große Flächen setzen per CSS-Variable --lg-blur einen eigenen Wert)
function filterFor(w, h, r, blur) {
  const look = LOOK[mode] || LOOK.tinted;
  const bezel = Math.min(look.bezel, Math.min(w, h) / 2);
  const shift = Math.round(look.shift * shiftK * 10) / 10;
  const key = `${w}x${h}r${Math.round(r)}b${blur}s${shift}${mode}`;
  let f = filters.get(key);
  if (!f) {
    const id = 'lg' + ++seq;
    const ns = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(ns, 'filter');
    node.setAttribute('id', id);
    node.setAttribute('x', '0');
    node.setAttribute('y', '0');
    node.setAttribute('width', w);
    node.setAttribute('height', h);
    node.setAttribute('filterUnits', 'userSpaceOnUse');
    node.setAttribute('color-interpolation-filters', 'sRGB');
    node.innerHTML =
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" edgeMode="duplicate" result="b"/>` +
      `<feImage href="${displacementMap(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
      `<feDisplacementMap in="b" in2="m" scale="${shift * 2}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
      `<feColorMatrix in="d" type="saturate" values="${look.sat}"/>`;
    svgHost().appendChild(node);
    f = { id, node, uses: 0 };
    filters.set(key, f);
  }
  return [key, f];
}

function release(key) {
  const f = key && filters.get(key);
  if (f) f.uses--;
  // alte, ungenutzte Filter aufräumen (größenabhängig entstehen beim Ändern der Fenstergröße viele)
  if (filters.size > 64) {
    for (const [k, v] of filters) {
      if (v.uses <= 0) {
        v.node.remove();
        filters.delete(k);
        if (filters.size <= 48) break;
      }
    }
  }
}

function apply(el) {
  if (!el.isConnected) return;
  const w = Math.ceil(el.offsetWidth / 2) * 2;
  const h = Math.ceil(el.offsetHeight / 2) * 2;
  if (w < 8 || h < 8 || w * h > 1600 * 1100) return;
  const cs = getComputedStyle(el);
  let r = parseFloat(cs.borderTopLeftRadius) || 0;
  if (cs.borderTopLeftRadius.endsWith('%')) r = (r / 100) * Math.min(w, h);
  const own = parseFloat(cs.getPropertyValue('--lg-blur'));
  const blur = Math.round((Number.isFinite(own) ? own : (LOOK[mode] || LOOK.tinted).blur) * blurK * 10) / 10;
  const [key, f] = filterFor(w, h, r, blur);
  if (applied.get(el) === key) return;
  release(applied.get(el));
  f.uses++;
  applied.set(el, key);
  el.style.setProperty('backdrop-filter', `url(#${f.id})`);
}

function schedule(el) {
  pending.add(el);
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const e of pending) apply(e);
      pending.clear();
    });
}

function track(el) {
  if (applied.has(el) || pending.has(el)) return;
  ro.observe(el);
  schedule(el);
}

function untrack(el) {
  ro?.unobserve(el);
  pending.delete(el);
  if (applied.has(el)) {
    release(applied.get(el));
    applied.delete(el);
    el.style.removeProperty('backdrop-filter');
  }
}

function scan(node, fn) {
  if (node.nodeType !== 1) return;
  if (node.matches(REFRACT)) fn(node);
  node.querySelectorAll(REFRACT).forEach(fn);
}

function startRefraction() {
  ro = new ResizeObserver((entries) => entries.forEach((e) => schedule(e.target)));
  mo = new MutationObserver((list) => {
    for (const m of list) {
      m.removedNodes.forEach((n) => scan(n, untrack));
      m.addedNodes.forEach((n) => scan(n, track));
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  scan(document.body, track);
}

function stopRefraction() {
  mo?.disconnect();
  ro?.disconnect();
  mo = ro = null;
  for (const el of applied.keys()) el.style.removeProperty('backdrop-filter');
  applied.clear();
  pending.clear();
  for (const f of filters.values()) f.node.remove();
  filters.clear();
}

// Lichtreflex: Position des Zeigers als CSS-Variablen (--gx/--gy) auf der Glasfläche darunter
let shineEl = null;
function unshine() {
  shineEl?.style.removeProperty('--gx');
  shineEl?.style.removeProperty('--gy');
  shineEl = null;
}
function onMove(e) {
  const el = e.target.closest?.(SHINE) || null;
  if (shineEl !== el) unshine();
  if (!el) return;
  shineEl = el;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--gx', e.clientX - r.left + 'px');
  el.style.setProperty('--gy', e.clientY - r.top + 'px');
}
// Zeiger verlässt das Fenster
function onOut(e) {
  if (!e.relatedTarget) unshine();
}

// Durchsichtiges Fenster (nur Desktop-App unter Windows 11 / macOS): statt des Hintergrunds scheint der Desktop durch.
// Ob das System es kann, weiß nur der Hauptprozess – bis zur Antwort bleibt alles, wie es ist.
let winOk = null;
let winSent = null;
if (window.nook?.setTransparent)
  window.nook
    .getConfig()
    .then((c) => {
      winOk = !!c.transparentSupported;
      winSent = !!c.transparent;
      update();
    })
    .catch(() => {});
export const windowGlassSupported = () => !!winOk;

// Wird bei jedem Rendern aufgerufen (applyTheme) und gleicht den Zustand mit den Einstellungen ab
export function syncGlass() {
  if (winOk !== null) {
    const on = winOk && !!prefs.glass && prefs.windowGlass;
    document.documentElement.toggleAttribute('data-winglass', on);
    if (on !== winSent) {
      winSent = on;
      window.nook.setTransparent(on);
    }
  }
  const want = prefs.glass || '';
  const wantRefract = !!want && prefs.glassRefraction && (prefs.glassRefractStr ?? 50) > 0 && refractionSupported();
  const bk = (prefs.glassBlur ?? 50) / 50;
  const sk = (prefs.glassRefractStr ?? 50) / 50;
  if (bk !== blurK || sk !== shiftK) {
    blurK = bk;
    shiftK = sk;
    // Filter mit den neuen Werten neu aufbauen – kurz verzögert, damit das Ziehen am Regler flüssig bleibt
    clearTimeout(rebuildT);
    rebuildT = setTimeout(() => {
      if (!refract) return;
      stopRefraction();
      startRefraction();
    }, 150);
  }
  if (want !== mode) {
    if (!mode && want) {
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerout', onOut, { passive: true });
    }
    if (mode && !want) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      unshine();
    }
    if (refract) stopRefraction();
    refract = false;
    mode = want;
  }
  if (wantRefract !== refract) {
    if (wantRefract) startRefraction();
    else stopRefraction();
    refract = wantRefract;
  }
}

// Liquid Glass ein-/ausschalten; die zuletzt gewählte Variante (getönt/klar) bleibt gemerkt
export function setGlass(v) {
  if (v) prefs.glassLast = v;
  setPref('glass', v);
}
export function toggleGlass() {
  setGlass(prefs.glass ? '' : prefs.glassLast || 'tinted');
}
