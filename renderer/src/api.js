import { io } from 'socket.io-client';
import { S, update, prefs, setPref, toast, savePrefs } from './store';
import { P, memberPerms } from '../../shared/perms';
import { sfx, startRing, stopRing } from './sounds';

export const isElectron = !!window.nook?.isElectron;
export let socket = null;
let voiceRef = null;
export function bindVoice(v) {
  voiceRef = v;
}

// ---------- URLs ----------
export function normServer(url) {
  url = String(url || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//.test(url)) url = 'http://' + url;
  if (url && !/:\d+$/.test(url.replace(/^https?:\/\//, '')) && !/^https:/.test(url)) url += ':3500';
  return url;
}
export function fileUrl(u) {
  if (!u) return '';
  return u.startsWith('/uploads/') ? S.serverUrl + u : u;
}
export function emojiUrl(id) {
  return S.serverUrl + '/uploads/' + id;
}

// ---------- Auth ----------
export async function auth(serverUrl, mode, body) {
  const base = normServer(serverUrl);
  let r;
  try {
    r = await fetch(base + '/api/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Server nicht erreichbar. Stimmt die Adresse und läuft der Server?');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Fehler ' + r.status);
  S.serverUrl = base;
  S.token = data.token;
  localStorage.setItem('nook.server', base);
  localStorage.setItem('nook.token', data.token);
  connect();
}

export function logout() {
  voiceRef?.leave();
  socket?.disconnect();
  socket = null;
  localStorage.removeItem('nook.token');
  Object.assign(S, { token: '', me: null, conn: 'idle', servers: {}, channels: {}, users: {}, messages: {}, voice: {} });
  update();
}

// ---------- Verbindung ----------
export function connect() {
  if (socket) socket.disconnect();
  S.conn = 'connecting';
  update();
  fetch(S.serverUrl + '/api/info')
    .then((r) => r.json())
    .then((i) => {
      if (i.iceServers) S.iceServers = i.iceServers;
    })
    .catch(() => {});
  socket = io(S.serverUrl, { auth: { token: S.token }, transports: ['websocket'], reconnectionDelayMax: 4000 });
  socket.on('ready', onReady);
  socket.on('ev', onEvent);
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      toast('Sitzung abgelaufen – bitte neu einloggen', 'error');
      logout();
    } else {
      S.conn = 'reconnecting';
      update();
    }
  });
  socket.on('disconnect', () => {
    S.conn = 'reconnecting';
    update();
  });
}

export function rpc(method, args = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Keine Verbindung zum Server'));
    socket.timeout(20000).emit('rpc', method, args, (err, r) => {
      if (err) reject(new Error('Zeitüberschreitung'));
      else if (r.error) reject(new Error(r.error));
      else resolve(r.data);
    });
  });
}

// Führt RPC aus und zeigt Fehler als Toast
export async function act(method, args, okText) {
  try {
    const r = await rpc(method, args);
    if (okText) toast(okText, 'success');
    return r;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

export function upload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', S.serverUrl + '/api/upload');
    xhr.setRequestHeader('Authorization', 'Bearer ' + S.token);
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'datei'));
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(d.error || 'Upload fehlgeschlagen'));
        else resolve(d);
      } catch {
        reject(new Error('Upload fehlgeschlagen'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload fehlgeschlagen'));
    xhr.send(file);
  });
}

export async function pickAndUpload(accept = 'image/*') {
  const file = await pickFile(accept);
  if (!file) return null;
  try {
    return await upload(file);
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

export function pickFile(accept = '*/*', multiple = false) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.multiple = multiple;
    inp.onchange = () => resolve(multiple ? [...inp.files] : inp.files[0] || null);
    inp.click();
  });
}

// ---------- Ereignisse ----------
function onReady(d) {
  const firstLoad = !S.me;
  S.me = d.me;
  S.users = d.users;
  S.rel = d.relationships;
  S.servers = {};
  S.channels = {};
  for (const s of d.servers) addServer(s);
  for (const c of d.dms) S.channels[c.id] = c;
  S.reads = d.reads;
  S.voice = d.voice;
  S.activities = d.activities || {};
  S.messages = {};
  S.conn = 'ready';
  if (S.view.serverId !== '@me' && !S.servers[S.view.serverId]) S.view = { serverId: '@me', channelId: null, homeTab: 'online' };
  if (S.view.channelId && !S.channels[S.view.channelId]) S.view.channelId = null;
  if (S.view.channelId) loadMessages(S.view.channelId);
  if (!firstLoad && voiceRef?.channelId) voiceRef.rejoin();
  updateBadge();
  checkUi(d.ui);
  update();
}

// ---------- Live-Updates der Oberfläche ----------
export function checkUi(v) {
  if (!v) return;
  const loaded = window.__NOOK_UI_V;
  // Web-Version: die Seite kam direkt vom Server -> aktuelle Version merken
  if (location.protocol !== 'file:' && (!loaded || loaded === 'local')) {
    window.__NOOK_UI_V = v;
    return;
  }
  if (loaded === v) return;
  S.uiUpdate = v;
  if (!voiceRef?.channelId) reloadForUpdate();
  update();
}
export function reloadForUpdate() {
  let last = 0;
  try {
    last = +sessionStorage.getItem('nook.uiReload') || 0;
    if (Date.now() - last < 20000) return;
    sessionStorage.setItem('nook.uiReload', String(Date.now()));
  } catch {}
  toast('Nook wird aktualisiert …', 'success', 2000);
  setTimeout(() => location.reload(), 1200);
}

function addServer(s) {
  const { channels, ...rest } = s;
  S.servers[s.id] = rest;
  for (const c of channels) S.channels[c.id] = c;
}

const typingTimers = {};

function onEvent(type, d) {
  switch (type) {
    case 'user': {
      S.users[d.id] = d;
      if (d.id === S.me.id) Object.assign(S.me, d, { status: S.me.status });
      break;
    }
    case 'me':
      Object.assign(S.me, d);
      break;
    case 'presence': {
      const u = S.users[d.userId];
      if (u) {
        u.status = d.status;
        u.customStatus = d.customStatus;
      }
      if (d.status === 'offline') delete S.activities[d.userId];
      break;
    }
    case 'activity':
      if (d.activity) S.activities[d.userId] = d.activity;
      else delete S.activities[d.userId];
      break;
    case 'relationship': {
      const prev = S.rel[d.userId];
      if (d.type) S.rel[d.userId] = d.type;
      else delete S.rel[d.userId];
      if (d.type === 'incoming' && prev !== 'incoming') {
        sfx('friend');
        notify('Freundschaftsanfrage', `${displayName(d.userId)} möchte mit dir befreundet sein`, { tag: 'friends' });
      }
      if (d.type === 'friend' && prev === 'outgoing') toast(`${displayName(d.userId)} hat deine Anfrage angenommen`, 'success');
      break;
    }
    case 'serverCreate':
      addServer(d);
      if (!prefs.serverOrder.includes(d.id)) setPref('serverOrder', [...prefs.serverOrder, d.id]);
      break;
    case 'serverUpdate':
      if (S.servers[d.id]) Object.assign(S.servers[d.id], d);
      break;
    case 'serverDelete': {
      delete S.servers[d.id];
      for (const c of Object.values(S.channels)) if (c.serverId === d.id) delete S.channels[c.id];
      if (S.view.serverId === d.id) S.view = { serverId: '@me', channelId: null, homeTab: 'online' };
      if (voiceRef?.serverId === d.id) voiceRef.leave();
      break;
    }
    case 'memberAdd':
    case 'memberUpdate':
      if (S.servers[d.serverId]) S.servers[d.serverId].members[d.userId] = d.member;
      break;
    case 'memberRemove':
      if (S.servers[d.serverId]) delete S.servers[d.serverId].members[d.userId];
      break;
    case 'channelCreate':
    case 'channelUpdate':
      S.channels[d.id] = { ...(S.channels[d.id] || {}), ...d };
      break;
    case 'channelDelete':
      delete S.channels[d.id];
      if (S.view.channelId === d.id) S.view.channelId = null;
      if (voiceRef?.channelId === d.id) voiceRef.leave();
      break;
    case 'message':
      onMessage(d);
      break;
    case 'messageUpdate': {
      const box = S.messages[d.channelId];
      if (box) {
        const i = box.list.findIndex((m) => m.id === d.id);
        if (i >= 0) box.list[i] = d;
      }
      break;
    }
    case 'messageDelete': {
      const box = S.messages[d.channelId];
      if (box) box.list = box.list.filter((m) => m.id !== d.id);
      break;
    }
    case 'reaction': {
      const box = S.messages[d.channelId];
      const m = box?.list.find((x) => x.id === d.messageId);
      if (m) {
        m.reactions = d.reactions;
        if (d.burst) {
          m._burst = { ...d.burst, at: Date.now() };
        }
      }
      break;
    }
    case 'typing': {
      const t = (S.typing[d.channelId] = S.typing[d.channelId] || {});
      t[d.userId] = Date.now() + 8000;
      clearTimeout(typingTimers[d.channelId + d.userId]);
      typingTimers[d.channelId + d.userId] = setTimeout(() => {
        delete t[d.userId];
        update();
      }, 8000);
      break;
    }
    case 'read':
      S.reads[d.channelId] = { last: d.last, mentions: d.mentions };
      updateBadge();
      break;
    case 'voiceState': {
      const prev = S.voice[d.userId];
      if (d.state) S.voice[d.userId] = d.state;
      else delete S.voice[d.userId];
      voiceRef?.onVoiceState(d.userId, prev, d.state);
      if (S.incomingCall && d.userId === S.me.id && d.state?.channelId === S.incomingCall.channelId) dismissCall();
      if (S.incomingCall && !Object.values(S.voice).some((v) => v.channelId === S.incomingCall.channelId)) dismissCall();
      break;
    }
    case 'rtc':
      voiceRef?.onSignal(d.from, d.data);
      break;
    case 'voiceKicked':
      voiceRef?.leave(true);
      toast(d.reason || 'Verbindung getrennt', 'error');
      break;
    case 'voiceMove':
      voiceRef?.join(d.channelId);
      break;
    case 'soundboard':
      voiceRef?.onSoundboard(d);
      break;
    case 'call': {
      if (voiceRef?.channelId === d.channelId) break;
      if (S.me.status === 'dnd') break;
      S.incomingCall = d;
      startRing();
      notify('Eingehender Anruf', `${displayName(d.from)} ruft dich an`, { tag: 'call:' + d.channelId });
      window.nook?.flash();
      break;
    }
    case 'uiUpdate':
      checkUi(d.v);
      break;
    case 'callDeclined':
      if (d.userId !== S.me.id && voiceRef?.channelId === d.channelId) toast(`${displayName(d.userId)} hat abgelehnt`);
      if (d.userId === S.me.id) dismissCall();
      break;
  }
  update();
}

export function dismissCall() {
  S.incomingCall = null;
  stopRing();
  update();
}

function onMessage(m) {
  const ch = S.channels[m.channelId];
  if (!ch) return;
  ch.lastMessageId = m.id;
  const box = S.messages[m.channelId];
  if (box) {
    const i = m.nonce ? box.list.findIndex((x) => x.nonce === m.nonce && x.pending) : -1;
    if (i >= 0) box.list[i] = m;
    else if (!box.list.some((x) => x.id === m.id)) box.list.push(m);
    if (box.list.length > 400 && !isViewing(m.channelId)) box.list = box.list.slice(-200);
  }
  if (S.typing[m.channelId]) delete S.typing[m.channelId][m.authorId];
  if (m.authorId === S.me.id) {
    S.reads[m.channelId] = { last: m.id, mentions: 0 };
    return;
  }
  if (S.rel[m.authorId] === 'blocked') return;
  const viewing = isViewing(m.channelId) && S.focused;
  const mentioned = mentionsMe(m, ch);
  if (!viewing && mentioned) {
    const r = (S.reads[m.channelId] = S.reads[m.channelId] || { last: null, mentions: 0 });
    r.mentions = (r.mentions || 0) + 1;
  }
  if (viewing) scheduleMarkRead(m.channelId);
  if (ch.type === 'dm' || ch.type === 'group') {
    const me = S.me;
    if (me.closedDMs?.[ch.id]) delete me.closedDMs[ch.id];
  }
  const level = notifyLevel(ch);
  const shouldNotify = !viewing && !m.silent && S.me.status !== 'dnd' && (level === 'all' || (level === 'mentions' && mentioned));
  if (shouldNotify) {
    sfx(mentioned ? 'mention' : 'message');
    const where = ch.type === 'dm' ? '' : ch.type === 'group' ? ` (${groupName(ch)})` : ` (#${ch.name}, ${S.servers[serverIdOf(ch)]?.name || ''})`;
    notify(displayName(m.authorId, serverIdOf(ch)) + where, plainText(m) || 'Anhang', { tag: 'ch:' + ch.id, icon: S.users[m.authorId]?.avatar });
    if (prefs.flash) window.nook?.flash();
  }
  updateBadge();
}

export function isViewing(chId) {
  return S.view.channelId === chId || S.panel?.threadId === chId;
}

export function mentionsMe(m, ch) {
  const me = S.me.id;
  if (ch.type === 'dm' || ch.type === 'group') return true;
  if (m.mentionEveryone || m.mentions?.includes(me) || m.replyPing === me) return true;
  const s = S.servers[serverIdOf(ch)];
  const roles = s?.members[me]?.roles || [];
  return !!m.mentionRoles?.some((r) => roles.includes(r));
}

export function notifyLevel(ch) {
  if (prefs.mutedChannels[ch.id]) return 'none';
  if (ch.type === 'dm' || ch.type === 'group') return 'all';
  const sid = serverIdOf(ch);
  return prefs.notif[ch.id] || prefs.notif[sid] || 'mentions';
}

export function notify(title, body, { tag, icon } = {}) {
  if (!prefs.desktopNotifs || S.me?.status === 'dnd') return;
  if (S.focused && !document.hidden && !tag?.startsWith('call')) return;
  if (window.nook) window.nook.notify({ title, body: body.slice(0, 200), tag });
  else if ('Notification' in window) {
    if (Notification.permission === 'granted') new Notification(title, { body, tag, icon: fileUrl(icon) }).onclick = () => onNotificationClick(tag);
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  }
}

export function onNotificationClick(tag) {
  if (!tag) return;
  if (tag.startsWith('ch:')) {
    const ch = S.channels[tag.slice(3)];
    if (ch) navigate(serverIdOf(ch) || '@me', ch.type === 'thread' ? ch.parentId : ch.id, ch.type === 'thread' ? ch.id : null);
  } else if (tag === 'friends') navigate('@me', null);
}

let readTimers = {};
export function scheduleMarkRead(chId) {
  clearTimeout(readTimers[chId]);
  readTimers[chId] = setTimeout(() => markRead(chId), 400);
}
export function markRead(chId) {
  const ch = S.channels[chId];
  if (!ch) return;
  const r = S.reads[chId];
  if (r && r.last === ch.lastMessageId && !r.mentions) return;
  S.reads[chId] = { last: ch.lastMessageId, mentions: 0 };
  rpc('markRead', { channelId: chId, messageId: ch.lastMessageId }).catch(() => {});
  updateBadge();
  update();
}

export function updateBadge() {
  let n = 0;
  for (const c of Object.values(S.channels)) {
    const r = S.reads[c.id];
    if ((c.type === 'dm' || c.type === 'group') && isUnread(c)) n += Math.max(1, r?.mentions || 0);
    else if (r?.mentions) n += r.mentions;
  }
  window.nook?.setBadge(n);
  document.title = n ? `(${n}) Nook` : 'Nook';
}

// ---------- Nachrichten laden ----------
export async function loadMessages(chId, force = false) {
  let box = S.messages[chId];
  if (box && box.loaded && !force) return;
  box = S.messages[chId] = { list: box?.list || [], loaded: false, hasMore: true, loading: true };
  try {
    const list = await rpc('getMessages', { channelId: chId, limit: 60 });
    box.list = list;
    box.hasMore = list.length >= 60;
    box.loaded = true;
  } catch (e) {
    toast(e.message, 'error');
  }
  box.loading = false;
  update();
}

export async function loadOlder(chId) {
  const box = S.messages[chId];
  if (!box || box.loading || !box.hasMore || !box.list.length) return false;
  box.loading = true;
  try {
    const list = await rpc('getMessages', { channelId: chId, before: box.list[0].id, limit: 60 });
    box.list = [...list, ...box.list];
    box.hasMore = list.length >= 60;
  } catch {}
  box.loading = false;
  update();
  return true;
}

export async function jumpTo(chId, msgId) {
  const ch = S.channels[chId];
  if (!ch) return;
  if (ch.type === 'thread') {
    navigate(serverIdOf(ch), ch.parentId, ch.id);
  } else navigate(serverIdOf(ch) || '@me', chId);
  const box = S.messages[chId];
  if (!box?.list.some((m) => m.id === msgId)) {
    const list = await rpc('getMessages', { channelId: chId, around: msgId });
    S.messages[chId] = { list, loaded: true, hasMore: true, loading: false, detached: true };
  }
  S.focusMsg = { id: msgId, at: Date.now() };
  update();
}

let nonceSeq = 0;
export async function sendMessage(chId, payload) {
  const nonce = 'n' + Date.now() + ++nonceSeq;
  const box = S.messages[chId];
  const pending = { id: 'zzzz' + nonce, nonce, pending: true, channelId: chId, authorId: S.me.id, type: 'default', content: payload.content || '', attachments: payload.attachments || [], replyTo: payload.replyTo, reactions: {}, createdAt: Date.now(), poll: payload.poll ? { ...payload.poll, options: payload.poll.options.map((t, i) => ({ id: 'p' + i, text: t.text || t })), votes: {}, endsAt: Date.now() + 3600e3 } : null };
  if (box) box.list.push(pending);
  sfx('send');
  update();
  try {
    await rpc('sendMessage', { channelId: chId, nonce, ...payload });
  } catch (e) {
    if (box) {
      pending.failed = true;
      pending.error = e.message;
    }
    toast(e.message, 'error');
    update();
  }
}

// ---------- Navigation ----------
export function navigate(serverId, channelId, threadId = null) {
  // Handy: Kanal gewählt -> Inhalt zeigen, nur Server gewählt -> Kanalliste zeigen
  S.mobileNav = channelId || serverId === '@me' ? 'content' : 'nav';
  if (serverId !== '@me' && !channelId) {
    channelId = prefs.lastChannel[serverId];
    if (!channelId || !S.channels[channelId]) channelId = sortedChannels(serverId).find((c) => c.type === 'text' || c.type === 'announce')?.id || null;
  }
  S.view = { ...S.view, serverId, channelId };
  try {
    localStorage.setItem('nook.view', JSON.stringify({ serverId, channelId }));
  } catch {}
  S.panel = threadId ? { threadId } : S.panel?.threadId && S.channels[S.panel.threadId]?.parentId !== channelId ? null : S.panel;
  if (serverId !== '@me' && channelId) {
    prefs.lastChannel[serverId] = channelId;
    savePrefs();
  }
  if (channelId) {
    loadMessages(channelId);
    if (S.focused) scheduleMarkRead(channelId);
  }
  if (threadId) {
    loadMessages(threadId);
    scheduleMarkRead(threadId);
  }
  update();
}

// ---------- Anzeige-Helfer ----------
export function serverIdOf(ch) {
  if (!ch) return null;
  if (ch.type === 'thread') return S.channels[ch.parentId]?.serverId || null;
  return ch.serverId || null;
}

export function displayName(uid, serverId) {
  const u = S.users[uid];
  const nick = serverId && S.servers[serverId]?.members[uid]?.nick;
  return nick || u?.displayName || u?.username || 'Unbekannt';
}

export function avatarOf(uid, serverId) {
  const sav = serverId && S.servers[serverId]?.members[uid]?.avatar;
  return fileUrl(sav || S.users[uid]?.avatar || '');
}

export function roleColor(uid, serverId) {
  const s = S.servers[serverId];
  const m = s?.members[uid];
  if (!m) return '';
  let best = null;
  for (const r of s.roles) if (m.roles.includes(r.id) && r.color) best = r;
  return best?.color || '';
}

export function hoistRole(uid, s) {
  const m = s.members[uid];
  let best = null;
  for (const r of s.roles) if (m?.roles.includes(r.id) && r.hoist) best = r;
  return best;
}

export function groupName(ch) {
  if (ch.name) return ch.name;
  const others = ch.recipients.filter((r) => r !== S.me.id);
  return others.map((r) => displayName(r)).join(', ') || 'Leere Gruppe';
}

export function channelTitle(ch) {
  if (!ch) return '';
  if (ch.type === 'dm') return displayName(ch.recipients.find((r) => r !== S.me.id) || S.me.id);
  if (ch.type === 'group') return groupName(ch);
  return ch.name;
}

export function myPerms(serverId) {
  return memberPerms(S.servers[serverId], S.me.id);
}
export function can(serverId, flag) {
  if (!serverId) return true;
  return (myPerms(serverId) & flag) === flag;
}
export { P };

export function sortedChannels(serverId) {
  return Object.values(S.channels)
    .filter((c) => c.serverId === serverId)
    .sort((a, b) => a.position - b.position);
}

export function isUnread(ch) {
  if (!ch?.lastMessageId) return false;
  const r = S.reads[ch.id];
  return !r || !r.last || r.last < ch.lastMessageId;
}

export function serverUnread(serverId) {
  let unread = false;
  let mentions = 0;
  for (const c of Object.values(S.channels)) {
    if (serverIdOf(c) !== serverId) continue;
    if (c.type === 'voice') continue;
    mentions += S.reads[c.id]?.mentions || 0;
    if (!prefs.mutedChannels[c.id] && notifyLevel(c) !== 'none' && isUnread(c)) unread = true;
  }
  return { unread, mentions };
}

export function dmList() {
  return Object.values(S.channels)
    .filter((c) => (c.type === 'dm' || c.type === 'group') && (!S.me.closedDMs?.[c.id] || isUnread(c) || S.view.channelId === c.id))
    .filter((c) => c.type !== 'dm' || c.lastMessageId || S.view.channelId === c.id || Object.values(S.voice).some((v) => v.channelId === c.id))
    .sort((a, b) => ((b.lastMessageId || b.id) > (a.lastMessageId || a.id) ? 1 : -1));
}

export function plainText(m) {
  return (m.content || '')
    .replace(/<@&(\w+)>/g, (_, id) => '@' + (Object.values(S.servers).flatMap((s) => s.roles).find((r) => r.id === id)?.name || 'Rolle'))
    .replace(/<@(\w+)>/g, (_, id) => '@' + displayName(id))
    .replace(/<#(\w+)>/g, (_, id) => '#' + (S.channels[id]?.name || 'kanal'))
    .replace(/<a?:(\w+):[^>]+>/g, ':$1:')
    .replace(/\|\|[^|]+\|\|/g, '▒▒▒▒')
    .slice(0, 300);
}

export function allCustomEmojis() {
  const out = [];
  for (const s of Object.values(S.servers)) for (const e of s.emojis || []) out.push({ ...e, serverId: s.id, serverName: s.name });
  return out;
}

export function allSounds() {
  const out = [];
  for (const s of Object.values(S.servers)) for (const x of s.sounds || []) out.push({ ...x, serverId: s.id, serverName: s.name });
  return out;
}

export function voiceMembers(chId) {
  return Object.entries(S.voice)
    .filter(([, v]) => v.channelId === chId)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([uid, v]) => ({ uid, ...v }));
}

export async function openDM(userId) {
  const ch = await act('openDM', { userId });
  S.channels[ch.id] = { ...(S.channels[ch.id] || {}), ...ch };
  if (S.me.closedDMs) delete S.me.closedDMs[ch.id];
  navigate('@me', ch.id);
  return ch;
}

export async function copy(text, label = 'Kopiert!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'success', 1800);
  } catch {
    toast('Kopieren nicht möglich', 'error');
  }
}

export function openExternal(url) {
  if (window.nook) window.nook.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

// Embeds (Link-Vorschau) cachen
export function getEmbed(url) {
  if (url in S.embeds) return S.embeds[url];
  S.embeds[url] = undefined;
  fetch(S.serverUrl + '/api/embed?url=' + encodeURIComponent(url), { headers: { Authorization: 'Bearer ' + S.token } })
    .then((r) => r.json())
    .then((d) => {
      S.embeds[url] = d;
      update();
    })
    .catch(() => {
      S.embeds[url] = null;
    });
  return undefined;
}

// Fokus/Idle
window.addEventListener('focus', () => onFocus(true));
window.addEventListener('blur', () => onFocus(false));
window.nook?.on('focus', (f) => onFocus(f));
window.nook?.on('notification-click', (tag) => onNotificationClick(tag));
function onFocus(f) {
  S.focused = f;
  if (f && S.view.channelId) scheduleMarkRead(S.view.channelId);
  if (f) setActive();
  update();
}

let autoIdle = false;
function setActive() {
  if (autoIdle && S.me && socket?.connected) {
    autoIdle = false;
    rpc('setStatus', { status: 'online' }).catch(() => {});
  }
}
setInterval(async () => {
  if (!S.me || !socket?.connected || !window.nook) return;
  const idle = await window.nook.idleTime();
  if (idle > prefs.idleMinutes * 60 && S.me.status === 'online' && !voiceRef?.channelId) {
    autoIdle = true;
    rpc('setStatus', { status: 'idle' }).catch(() => {});
  } else if (idle < 30) setActive();
}, 30000);
