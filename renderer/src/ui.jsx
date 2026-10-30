import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
import { S, update, closeModal, prefs } from './store';
import { avatarOf, displayName, fileUrl, isVideoUrl } from './api';
import { Icon } from './icons';
import { Deco, nameClasses, nameVars } from './cosmetics';
import { playTime, playClock } from './games';

// Spielzeit, die sich selbst aktualisiert: „seit 12 Min.“ oder als Uhr „1:05:12“
export function PlayTime({ since, clock = false }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), clock ? 1000 : 30000);
    return () => clearInterval(t);
  }, [clock]);
  if (!since) return null;
  return clock ? playClock(since) : playTime(since);
}

export const STATUS_LABEL = { online: 'Online', idle: 'Abwesend', dnd: 'Bitte nicht stören', invisible: 'Unsichtbar', offline: 'Offline' };

const COLORS = ['#d9774e', '#3aa88d', '#c9973a', '#d9607f', '#4a9ad9', '#7fa94a', '#9877d9', '#d46a78'];
// frühere grelle Standardfarben auf ruhigere Töne abbilden (bestehende Profile)
const SOFT = { '#ff7a45': '#d9774e', '#2dd4a7': '#3aa88d', '#f5c542': '#c9973a', '#ff5c8a': '#d9607f', '#4cc3ff': '#4a9ad9', '#a3e635': '#7fa94a', '#c084fc': '#9877d9', '#fb7185': '#d46a78' };
export const tone = (c) => (c && SOFT[c.toLowerCase()]) || c;
export function colorFor(id = '') {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function Avatar({ uid, size = 40, status = false, serverId, speaking = false, src, name, round = false, deco = true, decoration: decoOverride }) {
  const u = S.users[uid];
  const url = src !== undefined ? src : avatarOf(uid, serverId);
  const label = name || displayName(uid, serverId);
  const st = status ? (u?.status || 'offline') : null;
  const decoration = deco ? (decoOverride !== undefined ? decoOverride : u?.decoration) || undefined : undefined;
  return (
    <div class={`avatar ${round ? 'round' : ''} ${speaking ? 'speaking' : ''}`} style={{ width: size, height: size, '--deco': tone(u?.accent) || colorFor(uid) }}>
      {url && isVideoUrl(url) ? (
        <VideoAvatar src={url} live={size >= 64} />
      ) : url ? (
        <img class="img" src={url} alt="" draggable={false} loading="lazy" />
      ) : (
        <div class="img" style={{ backgroundColor: tone(u?.accent) || colorFor(uid), fontSize: size * 0.4 }}>
          {([...(label || '?').trim().normalize('NFKC')][0] || '?').toUpperCase()}
        </div>
      )}
      {decoration && <Deco id={decoration} size={size} />}
      {st && <div class={`status status-${st}`} title={STATUS_LABEL[st]} />}
    </div>
  );
}

// Video als Profilbild: in großen Ansichten läuft es immer, in Listen und im Chat nur,
// wenn die Maus über der Zeile ist (spart Leistung, wie bei animierten Avataren üblich)
const HOVER_ROW = '.mgroup, .member, .dm-item, .frow, .me-chip, .dock, .list-row, .pick-row, .gset-member, .opt, .bundle';
function VideoAvatar({ src, live }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const play = () => v.play().catch(() => {});
    const stop = () => {
      v.pause();
      v.currentTime = 0;
    };
    if (live) {
      play();
      return;
    }
    const row = v.closest(HOVER_ROW) || v.parentElement;
    row.addEventListener('mouseenter', play);
    row.addEventListener('mouseleave', stop);
    return () => {
      row.removeEventListener('mouseenter', play);
      row.removeEventListener('mouseleave', stop);
    };
  }, [src, live]);
  return <video ref={ref} class="img" src={src} muted loop playsInline preload={live ? 'auto' : 'metadata'} autoplay={live} disablePictureInPicture />;
}

export function StatusDot({ status, size = 10 }) {
  return <span class={`status-${status || 'offline'}`} style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', flex: 'none' }} />;
}

// Name mit Namens-Stil (Schrift, Farbverlauf, Effekt)
export function NameText({ text, ns, color, style: extra }) {
  const style = { ...(extra || {}), ...nameVars(ns) };
  if (!ns?.colors?.[0] && color) style.color = color;
  const cls = 'name ' + nameClasses(ns);
  if (ns?.effect === 'wave') {
    return (
      <span class={cls} style={style}>
        {[...text].map((c, i) => (
          <span style={{ animationDelay: i * 0.08 + 's' }}>{c === ' ' ? '\u00a0' : c}</span>
        ))}
      </span>
    );
  }
  return (
    <span class={cls} style={style}>
      {text}
    </span>
  );
}

export function Name({ uid, serverId, color, style: extra }) {
  return <NameText text={displayName(uid, serverId)} ns={S.users[uid]?.nameStyle} color={color} style={extra} />;
}

// Gruppenbild: eigenes Bild oder eine Collage aus bis zu drei Mitgliedern auf der Gruppenfarbe
export function GroupIcon({ ch, size = 34 }) {
  if (ch.icon) return <Avatar src={fileUrl(ch.icon)} size={size} name={ch.name || '?'} deco={false} />;
  const others = ch.recipients.filter((r) => r !== S.me.id).slice(0, 3);
  const sub = Math.round(size * [0.64, 0.64, 0.58, 0.5][others.length]);
  return (
    <div class={`gicon n${others.length}`} style={{ width: size, height: size, '--gc': ch.color || colorFor(ch.id) }}>
      {others.length ? others.map((id) => <Avatar uid={id} size={sub} deco={false} />) : <Icon name="users" size={size * 0.5} />}
    </div>
  );
}

export function onlineCount(ids) {
  return ids.filter((id) => S.users[id] && S.users[id].status !== 'offline').length;
}

export function ServerIcon({ server, size = 30 }) {
  if (server.icon) return <img class="sicon" src={fileUrl(server.icon)} style={{ width: size, height: size }} draggable={false} />;
  const initials = server.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3);
  return (
    <div class="sicon" style={{ width: size, height: size, background: colorFor(server.id), color: '#14100c' }}>
      {initials}
    </div>
  );
}

export function ChannelIcon({ ch, size }) {
  const name = { voice: 'speaker', announce: 'megaphone', stage: 'stage', forum: 'forum', thread: 'thread' }[ch.type] || 'hash';
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <Icon name={name} class="chan-ic" size={size} />
      {ch.private && <Icon name="lock" size={10} style={{ position: 'absolute', right: -3, bottom: -2, strokeWidth: 3 }} />}
    </span>
  );
}

export function Switch({ on, onChange }) {
  return <button class={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export function ToggleRow({ title, desc, on, onChange }) {
  return (
    <div class="toggle-row">
      <div class="grow">
        <div class="t">{title}</div>
        {desc && <div class="d">{desc}</div>}
      </div>
      <Switch on={on} onChange={onChange} />
    </div>
  );
}

// Gleitender Auswahl-Indikator: misst das aktive Kind (.on/.active) des Containers und schiebt
// ein .ind-Element dorthin (gleitet per CSS-Transition mit Feder-Kurve).
export function useIndicator() {
  const ref = useRef();
  const [box, setBox] = useState(null);
  const measure = () => {
    const c = ref.current;
    const a = c && [...c.children].find((x) => x.classList.contains('on') || x.classList.contains('active'));
    const nb = a ? { x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight } : null;
    setBox((b) => (b === nb || (b && nb && b.x === nb.x && b.y === nb.y && b.w === nb.w && b.h === nb.h) ? b : nb));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const c = ref.current;
    if (!c || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const ind = box && <span class="ind" style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w + 'px', height: box.h + 'px' }} />;
  return [ref, ind];
}

// Segment-Leiste mit eigenem Inhalt (Kinder tragen selbst die Klasse .on)
export function SegBox({ children, style }) {
  const [ref, ind] = useIndicator();
  return (
    <div class="seg" ref={ref} style={style}>
      {ind}
      {children}
    </div>
  );
}

export function Seg({ value, options, onChange }) {
  return (
    <SegBox>
      {options.map(([v, label]) => (
        <button class={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </SegBox>
  );
}

export function Modal({ title, sub, children, footer, wide, onClose = closeModal, style }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`modal ${wide ? 'wide' : ''}`} style={style}>
        {title && (
          <div class="mh">
            <div class="row">
              <h2 class="grow">{title}</h2>
              <button class="ibtn sm" onClick={onClose}>
                <Icon name="x" />
              </button>
            </div>
            {sub && <p>{sub}</p>}
          </div>
        )}
        <div class="mb">{children}</div>
        {footer && <div class="mf">{footer}</div>}
      </div>
    </div>
  );
}

export function ContextMenu() {
  const ref = useRef();
  const [pos, setPos] = useState(null);
  const m = S.menu;
  useLayoutEffect(() => {
    if (!m || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    let x = m.x;
    let y = m.y;
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
    setPos({ x, y });
  }, [m]);
  useEffect(() => {
    if (!m) return;
    const close = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      S.menu = null;
      update();
    };
    const esc = (e) => e.key === 'Escape' && close(e);
    setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('keydown', esc);
    });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [m]);
  if (!m) return null;
  const items = m.items.filter(Boolean);
  return (
    <div class="menu" ref={ref} style={{ left: (pos || m).x, top: (pos || m).y, visibility: pos ? 'visible' : 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => {
        if (it === '-') return items[i - 1] && items[i - 1] !== '-' && i < items.length - 1 ? <div class="menu-sep" /> : null;
        if (it.render) return <div class="menu-slider">{it.render()}</div>;
        return (
          <button
            class={`menu-item ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              if (!it.keep) S.menu = null;
              update();
              it.onClick?.();
            }}
          >
            <span class="grow ellipsis">{it.label}</span>
            {it.checked !== undefined && <span class={`ck ${it.checked ? 'on' : ''}`} />}
            {it.icon && <Icon name={it.icon} />}
          </button>
        );
      })}
    </div>
  );
}

// Popout neben einem Element positionieren
export function Positioned({ rect, children, prefer = 'right', onClose }) {
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x, y;
    if (prefer === 'right') {
      x = rect.right + 10;
      if (x + r.width > innerWidth - 10) x = rect.left - r.width - 10;
      y = rect.top;
    } else if (prefer === 'top') {
      x = rect.right - r.width;
      y = rect.top - r.height - 8;
      if (y < 10) y = rect.bottom + 8;
    } else {
      x = rect.left;
      y = rect.bottom + 8;
    }
    x = Math.max(10, Math.min(x, innerWidth - r.width - 10));
    y = Math.max(10, Math.min(y, innerHeight - r.height - 10));
    setPos({ x, y });
  }, [rect]);
  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.menu, .overlay, .lightbox')) onClose();
    };
    const esc = (e) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', close));
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, []);
  return (
    <div class="popout" ref={ref} style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}>
      {children}
    </div>
  );
}

const TOAST_ICON = { success: 'check', error: 'x', info: 'sparkle' };
export function Toasts() {
  return (
    <div class="toasts">
      {S.toasts.map((t) => (
        <div class={`toast ${t.kind}`} key={t.id}>
          <span class="ti">
            <Icon name={TOAST_ICON[t.kind] || 'bell'} size={14} />
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Hintergrund ----------
// Farbwolken bzw. eigenes Bild hinter der ganzen App. Im normalen Modus gedämpft,
// im Liquid-Glass-Modus voll sichtbar, damit das Glas etwas zum Brechen hat.
export const WALLPAPERS = [
  ['graphite', 'Graphit', 'Ruhig & neutral'],
  ['aurora', 'Aurora', 'Deine Akzentfarbe'],
  ['sunset', 'Sonnenuntergang', 'Orange, Pink, Lila'],
  ['ocean', 'Ozean', 'Türkis & Blau'],
  ['nebula', 'Nebel', 'Galaxie mit Sternen'],
  ['candy', 'Bonbon', 'Pastell'],
  ['forest', 'Wald', 'Grün & Petrol'],
  ['lava', 'Lava', 'Rot & Gold'],
  ['prism', 'Prisma', 'Lichtstrahlen'],
  ['bokeh', 'Bokeh', 'Leuchtende Kreise'],
];
// gewählter Hintergrund (eigenes Bild nur, wenn auch eins hochgeladen ist)
export function wallpaperId() {
  if (prefs.wallpaper === 'custom') return prefs.wallpaperUrl ? 'custom' : 'graphite';
  return WALLPAPERS.some(([w]) => w === prefs.wallpaper) ? prefs.wallpaper : 'graphite';
}
export function Wallpaper() {
  const id = wallpaperId();
  return (
    <div class={`wallpaper wp-${id} ${prefs.wallpaperMotion ? '' : 'still'}`} style={id === 'custom' ? { '--wp-img': `url("${fileUrl(prefs.wallpaperUrl)}")` } : null} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

// Tooltips über data-tip Attribut
export function TooltipLayer() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    let cur = null;
    let touchAt = 0;
    const over = (e) => {
      // Handy: iOS meldet beim Antippen ein „mouseover“ – sonst bleiben Tooltips einfach stehen
      if (Date.now() - touchAt < 800) return;
      const el = e.target.closest?.('[data-tip]');
      if (el === cur) return;
      cur = el;
      if (!el) return setTip(null);
      const r = el.getBoundingClientRect();
      setTip({ text: el.getAttribute('data-tip'), x: r.left + r.width / 2, y: r.top, bottom: r.bottom });
    };
    const out = () => {
      cur = null;
      setTip(null);
    };
    const touch = () => {
      touchAt = Date.now();
      out();
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mousedown', out);
    document.addEventListener('touchstart', touch, { passive: true, capture: true });
    return () => {
      document.removeEventListener('touchstart', touch, { capture: true });
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mousedown', out);
    };
  }, []);
  const ref = useRef();
  const [adj, setAdj] = useState(null);
  useLayoutEffect(() => {
    if (!tip || !ref.current) return setAdj(null);
    const r = ref.current.getBoundingClientRect();
    let x = tip.x - r.width / 2;
    let y = tip.y - r.height - 8;
    if (y < 6) y = tip.bottom + 8;
    x = Math.max(6, Math.min(x, innerWidth - r.width - 6));
    setAdj({ x, y });
  }, [tip]);
  if (!tip || !tip.text) return null;
  return (
    <div class="tooltip" ref={ref} style={{ left: adj?.x ?? -999, top: adj?.y ?? -999 }}>
      {tip.text}
    </div>
  );
}

// ---------- Formatierung ----------
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Heute';
  if (d.toDateString() === y.toDateString()) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  const day = fmtDay(ts);
  return (day === 'Heute' || day === 'Gestern' ? day : d.toLocaleDateString('de-DE')) + ' um ' + fmtTime(ts);
}
export function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}
export function fmtDuration(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}

export function Spinner() {
  return <div class="spin" />;
}

export function useInterval(fn, ms) {
  useEffect(() => {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function Video({ stream, mirror, cover, muted = true }) {
  const ref = useRef();
  // Hochkant-Bilder (Handykamera) nie abschneiden – sonst sieht man nur einen schmalen Streifen
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream || null;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  const onSize = (e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth * 1.05);
  return <video ref={ref} autoplay playsInline muted={muted} onLoadedMetadata={onSize} onResize={onSize} class={`${mirror ? 'mirror' : ''} ${cover && !portrait ? 'cover' : ''}`} />;
}
