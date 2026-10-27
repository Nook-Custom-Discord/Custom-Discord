import { useLayoutEffect, useState } from 'preact/hooks';

const PREF_DEFAULTS = {
  theme: 'ink',
  accent: '#ff7a45',
  fontScale: 1,
  density: 'cozy',
  reduceMotion: false,
  showEmbeds: true,
  autoplayGifs: true,
  inputDevice: '',
  outputDevice: '',
  cameraDevice: '',
  inputVolume: 1,
  outputVolume: 1,
  inputMode: 'vad',
  vadThreshold: -55,
  vadAuto: true,
  pttKey: 'KeyV',
  pttDelay: 200,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  streamQuality: '1080p60',
  streamContent: 'motion',
  streamAudio: true,
  cameraQuality: '720p',
  desktopNotifs: true,
  sounds: true,
  soundVolume: 0.6,
  flash: true,
  notif: {},
  mutedChannels: {},
  collapsed: {},
  lastChannel: {},
  serverOrder: [],
  userVolumes: {},
  localMutes: {},
  streamVolumes: {},
  recentEmojis: ['👍', '😂', '❤️', '🔥', '😭', '👀', '💀', '🎉'],
  favoriteGifs: [],
  showMembers: true,
  sendOnEnter: true,
  spellcheck: true,
  timeFormat24: true,
  idleMinutes: 10,
};

function loadPrefs() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem('nook.prefs') || '{}') };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}

export const prefs = loadPrefs();

export function setPref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem('nook.prefs', JSON.stringify(prefs));
  } catch {}
  update();
}

export function savePrefs() {
  try {
    localStorage.setItem('nook.prefs', JSON.stringify(prefs));
  } catch {}
}

export const S = {
  serverUrl: localStorage.getItem('nook.server') || (location.protocol.startsWith('http') ? location.origin : ''),
  token: localStorage.getItem('nook.token') || '',
  conn: 'idle',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  me: null,
  users: {},
  rel: {},
  servers: {},
  channels: {},
  messages: {},
  reads: {},
  voice: {},
  activities: {},
  typing: {},
  embeds: {},
  view: (() => {
    try {
      const v = JSON.parse(localStorage.getItem('nook.view') || '{}');
      return { serverId: v.serverId || '@me', channelId: v.channelId || null, homeTab: 'online' };
    } catch {
      return { serverId: '@me', channelId: null, homeTab: 'online' };
    }
  })(),
  modal: null,
  modals: [],
  popout: null,
  menu: null,
  toasts: [],
  incomingCall: null,
  settings: null,
  serverSettings: null,
  panel: null,
  focusMsg: null,
  replyTo: {},
  editing: null,
  drafts: {},
  focused: true,
};

const listeners = new Set();
let scheduled = false;
let version = 0;

export function update(fn) {
  if (fn) fn(S);
  version++;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const l of listeners) l();
  });
}

export function useStore() {
  const [, set] = useState(0);
  const seen = version;
  // useLayoutEffect: Listener sofort nach dem ersten Render registrieren und
  // Änderungen nachholen, die zwischen Render und Registrierung passiert sind
  useLayoutEffect(() => {
    const l = () => set((x) => x + 1);
    listeners.add(l);
    if (version !== seen) l();
    return () => listeners.delete(l);
  }, []);
  return S;
}

let toastId = 0;
export function toast(text, kind = 'info', ms = 3500) {
  const id = ++toastId;
  S.toasts = [...S.toasts, { id, text, kind }];
  update();
  setTimeout(() => {
    S.toasts = S.toasts.filter((t) => t.id !== id);
    update();
  }, ms);
}

export function openModal(type, props = {}) {
  S.modals = [...S.modals, { type, props, key: Math.random() }];
  update();
}
export function closeModal() {
  S.modals = S.modals.slice(0, -1);
  update();
}

export function openMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  S.menu = { x: e.clientX, y: e.clientY, items };
  update();
}

export function openPopout(e, type, props) {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  S.popout = { type, props, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width } };
  update();
}

export function confirmDialog(title, text, { danger = true, ok = 'Bestätigen' } = {}) {
  return new Promise((resolve) => openModal('confirm', { title, text, danger, ok, resolve }));
}

export function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Speichern', multiline = false } = {}) {
  return new Promise((resolve) => openModal('prompt', { title, label, value, placeholder, ok, resolve, multiline }));
}
