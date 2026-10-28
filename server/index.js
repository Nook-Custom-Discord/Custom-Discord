// Nook-Server: HTTP (Login, Uploads, Link-Vorschauen, Web-Client) + Socket.IO (Echtzeit, Voice-Signaling)
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Store, newId } = require('./db');
const { P, DEFAULT_PERMS, has, memberPerms } = require('../shared/perms');

const MAX_UPLOAD = (Number(process.env.NOOK_MAX_UPLOAD_MB) || 2048) * 1024 * 1024; // Standard 2 GB pro Datei
const STORAGE_LIMIT = (Number(process.env.NOOK_STORAGE_LIMIT_MB) || 0) * 1024 * 1024; // 0 = kein Limit
const MAX_MSG = 6000;

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}

function startServer({ port = 3500, dataDir = path.join(process.cwd(), 'nook-data'), host = '0.0.0.0', log = console.log } = {}) {
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const store = new Store(path.join(dataDir, 'db.json'));
  const db = store.data;
  const save = () => store.save();

  // ---------- Hilfsfunktionen ----------
  const sockets = new Map(); // uid -> Set<socket>
  const voice = new Map(); // uid -> voice state
  const embedCache = new Map();

  function publicUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar || '',
      banner: u.banner || '',
      bio: u.bio || '',
      pronouns: u.pronouns || '',
      accent: u.accent || '',
      theme: u.theme || null,
      decoration: u.decoration || '',
      effect: u.effect || '',
      nameStyle: u.nameStyle || null,
      nameplate: u.nameplate || '',
      frame: u.frame || '',
      createdAt: u.createdAt,
      status: effectiveStatus(u.id),
      customStatus: u.customStatus || null,
    };
  }

  function effectiveStatus(uid) {
    const u = db.users[uid];
    if (!u || !sockets.get(uid)?.size) return 'offline';
    return u.status === 'invisible' ? 'offline' : u.status || 'online';
  }

  function rel(a, b) {
    return db.rel[a]?.[b] || null;
  }
  function setRel(a, b, type) {
    db.rel[a] = db.rel[a] || {};
    if (type) db.rel[a][b] = type;
    else delete db.rel[a][b];
  }
  function blockedEither(a, b) {
    return rel(a, b) === 'blocked' || rel(b, a) === 'blocked';
  }

  function userServers(uid) {
    return Object.values(db.servers).filter((s) => s.members[uid]);
  }

  function relatedUsers(uid) {
    const set = new Set();
    for (const id of Object.keys(db.rel[uid] || {})) set.add(id);
    for (const s of userServers(uid)) for (const id of Object.keys(s.members)) set.add(id);
    for (const c of Object.values(db.channels)) {
      if ((c.type === 'dm' || c.type === 'group') && c.recipients.includes(uid)) c.recipients.forEach((r) => set.add(r));
    }
    for (const [id, map] of Object.entries(db.rel)) if (map[uid]) set.add(id);
    set.delete(uid);
    return [...set];
  }

  function canView(ch, uid) {
    if (!ch) return false;
    if (ch.type === 'dm' || ch.type === 'group') return ch.recipients.includes(uid);
    if (ch.type === 'thread') return canView(db.channels[ch.parentId], uid);
    const s = db.servers[ch.serverId];
    if (!s || !s.members[uid]) return false;
    if (!ch.private) return true;
    if (has(s, uid, P.ADMIN) || has(s, uid, P.MANAGE_CHANNELS)) return true;
    const m = s.members[uid];
    return (ch.allowedRoles || []).some((r) => m.roles.includes(r)) || (ch.allowedUsers || []).includes(uid);
  }

  function audience(ch) {
    if (!ch) return [];
    if (ch.type === 'dm' || ch.type === 'group') return ch.recipients;
    const s = db.servers[ch.serverId];
    if (!s) return [];
    return Object.keys(s.members).filter((uid) => canView(ch, uid));
  }

  function emitTo(uids, type, data) {
    for (const uid of new Set(uids)) io.to('u:' + uid).emit('ev', type, data);
  }

  function serverBundle(s, uid) {
    return {
      id: s.id,
      name: s.name,
      icon: s.icon || '',
      banner: s.banner || '',
      description: s.description || '',
      ownerId: s.ownerId,
      roles: s.roles,
      members: s.members,
      categories: s.categories,
      emojis: s.emojis,
      sounds: s.sounds,
      bans: has(s, uid, P.BAN) ? s.bans : {},
      channels: Object.values(db.channels).filter((c) => c.serverId === s.id && canView(c, uid)),
    };
  }

  function serverForChannel(ch) {
    if (!ch) return null;
    if (ch.type === 'thread') return db.servers[db.channels[ch.parentId]?.serverId] || null;
    return db.servers[ch.serverId] || null;
  }

  function chanPerm(ch, uid, flag) {
    if (ch.type === 'dm' || ch.type === 'group') return true;
    return has(serverForChannel(ch), uid, flag);
  }

  function need(cond, msg) {
    if (!cond) throw new Error(msg || 'Keine Berechtigung');
  }

  function cleanStr(v, max = 100) {
    return String(v ?? '').slice(0, max);
  }
  function cleanUrl(v) {
    v = String(v || '');
    return v.startsWith('/uploads/') || v === '' ? v : '';
  }

  function broadcastPresence(uid) {
    const u = db.users[uid];
    emitTo([...relatedUsers(uid), uid], 'presence', { userId: uid, status: effectiveStatus(uid), customStatus: u.customStatus || null });
  }

  function broadcastUser(uid) {
    emitTo([...relatedUsers(uid), uid], 'user', publicUser(db.users[uid]));
  }

  function sysMessage(ch, authorId, kind, extra = {}) {
    const msg = { id: newId(), channelId: ch.id, authorId, type: 'system', kind, content: '', createdAt: Date.now(), reactions: {}, ...extra };
    (db.messages[ch.id] = db.messages[ch.id] || []).push(msg);
    ch.lastMessageId = msg.id;
    emitTo(audience(ch), 'message', msg);
    save();
  }

  function removeFromServer(s, uid) {
    delete s.members[uid];
    const vs = voice.get(uid);
    if (vs && vs.serverId === s.id) leaveVoice(uid);
    emitTo([uid], 'serverDelete', { id: s.id });
    emitTo(Object.keys(s.members), 'memberRemove', { serverId: s.id, userId: uid });
  }

  // ---------- Voice ----------
  function leaveVoice(uid) {
    const vs = voice.get(uid);
    if (!vs) return;
    voice.delete(uid);
    const ch = db.channels[vs.channelId];
    emitTo(audience(ch), 'voiceState', { userId: uid, state: null });
  }

  // ---------- HTTP ----------
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Filename');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));
  // Oberfläche: Updates im Ordner <dataDir>/ui haben Vorrang vor der eingebauten Version.
  // So bekommen alle Freunde Änderungen live, ohne neu zu installieren.
  const uiDir = path.join(dataDir, 'ui');
  const builtinUi = path.join(__dirname, '..', 'renderer');
  function uiVersion() {
    const h = crypto.createHash('sha1');
    for (const f of ['bundle.js', 'styles.css']) {
      const p = fs.existsSync(path.join(uiDir, f)) ? path.join(uiDir, f) : path.join(builtinUi, f);
      try {
        h.update(fs.readFileSync(p));
      } catch {}
    }
    return h.digest('hex').slice(0, 12);
  }
  let currentUi = uiVersion();
  const noCache = { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
  app.use(express.static(uiDir, noCache));
  app.use(express.static(builtinUi, noCache));
  app.get('/api/ui', (req, res) => res.json({ v: currentUi }));

  // ---------- Admin: Umzug auf ein anderes Gerät & Live-Updates aus der Ferne ----------
  // Der Schlüssel liegt nur im Datenordner (admin.key) und ist nirgends sonst sichtbar.
  const keyFile = path.join(dataDir, 'admin.key');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(24).toString('hex'));
  const adminKey = fs.readFileSync(keyFile, 'utf8').trim();
  const isAdmin = (k) => typeof k === 'string' && k.length === adminKey.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(adminKey));
  app.get('/api/export/:key/db', (req, res) => {
    if (!isAdmin(req.params.key)) return res.status(403).end();
    store.flush();
    res.sendFile(path.join(dataDir, 'db.json'));
  });
  app.get('/api/export/:key/files', (req, res) => {
    if (!isAdmin(req.params.key)) return res.status(403).end();
    res.type('text/plain').send(fs.readdirSync(uploadsDir).join('\n'));
  });
  app.put('/api/admin/:key/ui/:file', (req, res) => {
    if (!isAdmin(req.params.key) || !['bundle.js', 'styles.css', 'index.html'].includes(req.params.file)) return res.status(403).end();
    const tmp = path.join(uiDir, req.params.file + '.tmp');
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    out.on('finish', () => {
      fs.renameSync(tmp, path.join(uiDir, req.params.file));
      res.json({ ok: true });
    });
    out.on('error', () => res.status(500).end());
  });
  fs.mkdirSync(uiDir, { recursive: true });
  let uiTimer = null;
  try {
    fs.watch(uiDir, () => {
      clearTimeout(uiTimer);
      uiTimer = setTimeout(() => {
        const v = uiVersion();
        if (v !== currentUi) {
          currentUi = v;
          log('[nook] Neue Oberfläche verteilt: ' + v);
          io.emit('ev', 'uiUpdate', { v });
        }
      }, 1500);
    });
  } catch {}

  function authUser(req) {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return db.tokens[t] ? db.users[db.tokens[t]] : null;
  }

  function issueToken(uid) {
    const token = crypto.randomBytes(32).toString('hex');
    db.tokens[token] = uid;
    save();
    return token;
  }

  app.get('/api/info', (req, res) => {
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.TURN_URL) {
      iceServers.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });
    }
    res.json({ name: 'Nook', version: 2, ui: currentUi, users: Object.keys(db.users).length, inviteOnly: !!process.env.NOOK_REGISTER_CODE, iceServers });
  });

  app.post('/api/register', express.json(), (req, res) => {
    const { username, password, displayName, code } = req.body || {};
    const uname = String(username || '').toLowerCase().trim();
    if (process.env.NOOK_REGISTER_CODE && code !== process.env.NOOK_REGISTER_CODE) return res.status(403).json({ error: 'Falscher Registrierungscode' });
    if (!/^[a-z0-9_.]{2,32}$/.test(uname)) return res.status(400).json({ error: 'Benutzername: 2–32 Zeichen, nur a–z, 0–9, _ und .' });
    if (String(password || '').length < 6) return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
    if (Object.values(db.users).some((u) => u.username === uname)) return res.status(409).json({ error: 'Benutzername ist schon vergeben' });
    const { salt, hash } = hashPassword(String(password));
    const id = newId();
    const accents = ['#d9774e', '#3aa88d', '#c9973a', '#d9607f', '#4a9ad9', '#7fa94a', '#9877d9'];
    db.users[id] = {
      id,
      username: uname,
      displayName: cleanStr(displayName || username, 32).trim() || uname,
      salt,
      hash,
      accent: accents[Math.floor(Math.random() * accents.length)],
      status: 'online',
      createdAt: Date.now(),
    };
    res.json({ token: issueToken(id) });
  });

  app.post('/api/login', express.json(), (req, res) => {
    const { username, password } = req.body || {};
    const u = Object.values(db.users).find((x) => x.username === String(username || '').toLowerCase().trim());
    if (!u) return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    const { hash } = hashPassword(String(password || ''), u.salt);
    if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.hash, 'hex'))) return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    res.json({ token: issueToken(u.id) });
  });

  // belegten Speicher der Uploads merken (für das Speicherlimit)
  let usedBytes = 0;
  try {
    for (const f of fs.readdirSync(uploadsDir)) usedBytes += fs.statSync(path.join(uploadsDir, f)).size;
  } catch {}
  app.get('/api/storage', (req, res) => res.json({ used: usedBytes, limit: STORAGE_LIMIT, maxUpload: MAX_UPLOAD }));

  app.post('/api/upload', (req, res) => {
    const u = authUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht eingeloggt' });
    const announced = Number(req.headers['content-length']) || 0;
    if (announced > MAX_UPLOAD) return res.status(413).json({ error: `Datei zu groß (max. ${Math.round(MAX_UPLOAD / 1048576)} MB)` });
    if (STORAGE_LIMIT && usedBytes + announced > STORAGE_LIMIT) return res.status(507).json({ error: 'Der Server-Speicher ist voll. Bitte den Admin, alte Dateien zu löschen.' });
    const name = decodeURIComponent(String(req.headers['x-filename'] || 'datei')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const ext = (path.extname(name).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
    const file = newId() + crypto.randomBytes(4).toString('hex') + ext;
    const dest = path.join(uploadsDir, file);
    const out = fs.createWriteStream(dest);
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD && !aborted) {
        aborted = true;
        out.destroy();
        fs.rm(dest, () => {});
        res.status(413).json({ error: `Datei zu groß (max. ${Math.round(MAX_UPLOAD / 1048576)} MB)` });
        req.destroy();
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (aborted) return;
      usedBytes += size;
      res.json({ url: '/uploads/' + file, name, size, type: String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100) });
    });
    out.on('error', () => !aborted && res.status(500).json({ error: 'Upload fehlgeschlagen' }));
  });

  // Link-Vorschau (Open-Graph)
  const privateHost = (h) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(h);
  app.get('/api/embed', async (req, res) => {
    if (!authUser(req)) return res.status(401).end();
    let url;
    try {
      url = new URL(String(req.query.url));
    } catch {
      return res.json(null);
    }
    if (!/^https?:$/.test(url.protocol) || privateHost(url.hostname)) return res.json(null);
    const key = url.href;
    if (embedCache.has(key)) return res.json(embedCache.get(key));
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(key, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NookBot/1.0; +link-preview)', Accept: 'text/html,*/*' } });
      clearTimeout(t);
      const ct = r.headers.get('content-type') || '';
      let out = null;
      if (ct.startsWith('image/')) out = { type: 'image', url: key };
      else if (ct.startsWith('video/')) out = { type: 'video', url: key };
      else if (ct.includes('html')) {
        const reader = r.body.getReader();
        let html = '';
        while (html.length < 600000) {
          const { done, value } = await reader.read();
          if (done) break;
          html += Buffer.from(value).toString('utf8');
          if (html.includes('</head>')) break;
        }
        reader.cancel().catch(() => {});
        const meta = (prop) => {
          const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
          const tag = html.match(re)?.[0];
          const v = tag?.match(/content=["']([^"']*)["']/i)?.[1];
          return v ? v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
        };
        const title = meta('og:title') || meta('twitter:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
        let image = meta('og:image') || meta('twitter:image');
        if (image) try { image = new URL(image, key).href; } catch {}
        out = {
          type: 'link',
          url: key,
          site: meta('og:site_name') || url.hostname,
          title: title.slice(0, 200),
          description: (meta('og:description') || meta('description')).slice(0, 400),
          image,
          video: meta('og:video:secure_url') || meta('og:video') || '',
          color: meta('theme-color'),
        };
        if (!out.title && !out.description && !out.image) out = null;
      }
      embedCache.set(key, out);
      res.json(out);
    } catch {
      embedCache.set(key, null);
      res.json(null);
    }
  });

  app.get('/api/invite/:code', (req, res) => {
    const inv = db.invites[req.params.code];
    const s = inv && db.servers[inv.serverId];
    if (!s) return res.status(404).json({ error: 'Einladung ungültig' });
    res.json({ code: inv.code, server: { id: s.id, name: s.name, icon: s.icon, banner: s.banner, members: Object.keys(s.members).length } });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: true }, maxHttpBufferSize: 5e6 });

  io.use((socket, next) => {
    const uid = db.tokens[socket.handshake.auth?.token];
    if (!uid || !db.users[uid]) return next(new Error('unauthorized'));
    socket.uid = uid;
    next();
  });

  // ---------- RPC-Handler ----------
  const H = {
    // ----- Profil -----
    updateProfile(uid, a) {
      const u = db.users[uid];
      if (a.displayName !== undefined) u.displayName = cleanStr(a.displayName, 32).trim() || u.username;
      if (a.avatar !== undefined) u.avatar = cleanUrl(a.avatar);
      if (a.banner !== undefined) u.banner = cleanUrl(a.banner);
      if (a.bio !== undefined) u.bio = cleanStr(a.bio, 400);
      if (a.pronouns !== undefined) u.pronouns = cleanStr(a.pronouns, 40);
      if (a.accent !== undefined) u.accent = cleanStr(a.accent, 20);
      if (a.theme !== undefined) u.theme = Array.isArray(a.theme) ? a.theme.slice(0, 2).map((c) => cleanStr(c, 20)) : null;
      if (a.decoration !== undefined) u.decoration = cleanStr(a.decoration, 30);
      if (a.effect !== undefined) u.effect = cleanStr(a.effect, 30);
      if (a.nameStyle !== undefined) u.nameStyle = a.nameStyle ? { font: cleanStr(a.nameStyle.font, 30), effect: cleanStr(a.nameStyle.effect, 30), colors: (a.nameStyle.colors || []).slice(0, 2).map((c) => cleanStr(c, 20)) } : null;
      if (a.nameplate !== undefined) u.nameplate = cleanStr(a.nameplate, 30);
      if (a.frame !== undefined) u.frame = cleanStr(a.frame, 30);
      if (a.username !== undefined) {
        const un = String(a.username).toLowerCase().trim();
        need(/^[a-z0-9_.]{2,32}$/.test(un), 'Benutzername: 2–32 Zeichen, nur a–z, 0–9, _ und .');
        need(!Object.values(db.users).some((x) => x.username === un && x.id !== uid), 'Benutzername ist schon vergeben');
        u.username = un;
      }
      save();
      broadcastUser(uid);
      return publicUser(u);
    },
    changePassword(uid, { oldPassword, newPassword }) {
      const u = db.users[uid];
      need(hashPassword(String(oldPassword || ''), u.salt).hash === u.hash, 'Altes Passwort ist falsch');
      need(String(newPassword || '').length >= 6, 'Neues Passwort zu kurz');
      Object.assign(u, hashPassword(String(newPassword)));
      save();
      return true;
    },
    setStatus(uid, { status, customStatus }) {
      const u = db.users[uid];
      if (status && ['online', 'idle', 'dnd', 'invisible'].includes(status)) u.status = status;
      if (customStatus !== undefined) u.customStatus = customStatus && (customStatus.text || customStatus.emoji) ? { text: cleanStr(customStatus.text, 128), emoji: cleanStr(customStatus.emoji, 80), expires: customStatus.expires || null } : null;
      save();
      broadcastPresence(uid);
      emitTo([uid], 'me', { status: u.status, customStatus: u.customStatus || null });
      return true;
    },
    deleteAccount(uid, { password }) {
      const u = db.users[uid];
      need(hashPassword(String(password || ''), u.salt).hash === u.hash, 'Passwort ist falsch');
      need(!userServers(uid).some((s) => s.ownerId === uid), 'Übertrage oder lösche zuerst deine eigenen Server');
      for (const s of userServers(uid)) removeFromServer(s, uid);
      for (const [t, id] of Object.entries(db.tokens)) if (id === uid) delete db.tokens[t];
      u.deleted = true;
      u.displayName = 'Gelöschter Nutzer';
      u.username = 'deleted_' + uid;
      u.avatar = u.banner = u.bio = '';
      save();
      for (const s of sockets.get(uid) || []) s.disconnect(true);
      return true;
    },

    // ----- Freunde -----
    friendRequest(uid, { username }) {
      const target = Object.values(db.users).find((u) => u.username === String(username || '').toLowerCase().trim().replace(/^@/, ''));
      need(target && !target.deleted, 'Diesen Benutzernamen gibt es nicht');
      need(target.id !== uid, 'Du kannst dich nicht selbst hinzufügen');
      need(rel(target.id, uid) !== 'blocked', 'Anfrage konnte nicht gesendet werden');
      const r = rel(uid, target.id);
      need(r !== 'friend', 'Ihr seid bereits befreundet');
      if (r === 'incoming') return H.friendAccept(uid, { userId: target.id });
      setRel(uid, target.id, 'outgoing');
      setRel(target.id, uid, 'incoming');
      save();
      emitTo([uid], 'user', publicUser(target));
      emitTo([target.id], 'user', publicUser(db.users[uid]));
      emitTo([uid], 'relationship', { userId: target.id, type: 'outgoing' });
      emitTo([target.id], 'relationship', { userId: uid, type: 'incoming' });
      return true;
    },
    friendAccept(uid, { userId }) {
      need(rel(uid, userId) === 'incoming', 'Keine offene Anfrage');
      setRel(uid, userId, 'friend');
      setRel(userId, uid, 'friend');
      save();
      emitTo([uid], 'relationship', { userId, type: 'friend' });
      emitTo([userId], 'relationship', { userId: uid, type: 'friend' });
      return true;
    },
    friendRemove(uid, { userId }) {
      const mine = rel(uid, userId);
      if (mine === 'blocked') return true;
      setRel(uid, userId, null);
      if (rel(userId, uid) !== 'blocked') setRel(userId, uid, null);
      save();
      emitTo([uid], 'relationship', { userId, type: null });
      if (rel(userId, uid) !== 'blocked') emitTo([userId], 'relationship', { userId: uid, type: null });
      return true;
    },
    block(uid, { userId }) {
      need(db.users[userId] && userId !== uid);
      setRel(uid, userId, 'blocked');
      if (rel(userId, uid) !== 'blocked') {
        setRel(userId, uid, null);
        emitTo([userId], 'relationship', { userId: uid, type: null });
      }
      save();
      emitTo([uid], 'user', publicUser(db.users[userId]));
      emitTo([uid], 'relationship', { userId, type: 'blocked' });
      return true;
    },
    unblock(uid, { userId }) {
      if (rel(uid, userId) === 'blocked') setRel(uid, userId, null);
      save();
      emitTo([uid], 'relationship', { userId, type: null });
      return true;
    },
    setNote(uid, { userId, note }) {
      const u = db.users[uid];
      u.notes = u.notes || {};
      u.notes[userId] = cleanStr(note, 256);
      save();
      return true;
    },

    // ----- DMs & Gruppen -----
    openDM(uid, { userId }) {
      need(db.users[userId], 'Unbekannter Nutzer');
      let ch = Object.values(db.channels).find((c) => c.type === 'dm' && c.recipients.includes(uid) && c.recipients.includes(userId));
      if (!ch) {
        ch = { id: newId(), type: 'dm', recipients: [uid, userId], createdAt: Date.now(), lastMessageId: null };
        db.channels[ch.id] = ch;
        save();
        emitTo([uid, userId], 'user', publicUser(db.users[uid]));
        emitTo([uid], 'user', publicUser(db.users[userId]));
        emitTo(ch.recipients, 'channelCreate', ch);
      }
      return ch;
    },
    createGroup(uid, { userIds = [], name = '', color = '' }) {
      const ids = [...new Set([uid, ...userIds])].filter((id) => db.users[id]);
      need(ids.length >= 2, 'Wähle mindestens eine Person');
      need(ids.length <= 25, 'Maximal 25 Personen');
      for (const id of ids) if (id !== uid) need(rel(uid, id) === 'friend', 'Du kannst nur Freunde hinzufügen');
      const ch = { id: newId(), type: 'group', recipients: ids, ownerId: uid, name: cleanStr(name, 60), icon: '', topic: '', color: /^#[0-9a-f]{6}$/i.test(color) ? color : '', createdAt: Date.now(), lastMessageId: null };
      db.channels[ch.id] = ch;
      save();
      for (const id of ids) emitTo(ids, 'user', publicUser(db.users[id]));
      emitTo(ids, 'channelCreate', ch);
      return ch;
    },
    groupAdd(uid, { channelId, userId }) {
      const ch = db.channels[channelId];
      need(ch?.type === 'group' && ch.recipients.includes(uid));
      need(rel(uid, userId) === 'friend', 'Nur Freunde können hinzugefügt werden');
      if (!ch.recipients.includes(userId)) {
        ch.recipients.push(userId);
        save();
        for (const id of ch.recipients) emitTo(ch.recipients, 'user', publicUser(db.users[id]));
        emitTo([userId], 'channelCreate', ch);
        emitTo(ch.recipients, 'channelUpdate', ch);
        sysMessage(ch, uid, 'groupAdd', { targetId: userId });
      }
      return true;
    },
    groupRemove(uid, { channelId, userId }) {
      const ch = db.channels[channelId];
      need(ch?.type === 'group' && ch.recipients.includes(uid));
      need(userId === uid || ch.ownerId === uid, 'Nur der Besitzer kann Leute entfernen');
      ch.recipients = ch.recipients.filter((r) => r !== userId);
      if (ch.ownerId === userId) ch.ownerId = ch.recipients[0];
      if (voice.get(userId)?.channelId === ch.id) leaveVoice(userId);
      save();
      emitTo([userId], 'channelDelete', { id: ch.id });
      if (ch.recipients.length) {
        emitTo(ch.recipients, 'channelUpdate', ch);
        sysMessage(ch, uid, userId === uid ? 'groupLeave' : 'groupRemove', { targetId: userId });
      }
      return true;
    },
    updateGroup(uid, { channelId, name, icon, ownerId, topic, color }) {
      const ch = db.channels[channelId];
      need(ch?.type === 'group' && ch.recipients.includes(uid));
      const newOwner = ownerId !== undefined && ownerId !== ch.ownerId;
      if (ownerId !== undefined) {
        need(ch.ownerId === uid && ch.recipients.includes(ownerId), 'Nur der Besitzer kann das');
        ch.ownerId = ownerId;
      }
      const renamed = name !== undefined && cleanStr(name, 60) !== (ch.name || '');
      const newIcon = icon !== undefined && cleanUrl(icon) !== (ch.icon || '');
      if (name !== undefined) ch.name = cleanStr(name, 60);
      if (icon !== undefined) ch.icon = cleanUrl(icon);
      if (topic !== undefined) ch.topic = cleanStr(topic, 200);
      if (color !== undefined) ch.color = /^#[0-9a-f]{6}$/i.test(color) ? color : '';
      save();
      emitTo(ch.recipients, 'channelUpdate', ch);
      if (renamed) sysMessage(ch, uid, 'groupRename', { name: ch.name });
      if (newIcon) sysMessage(ch, uid, 'groupIcon');
      if (newOwner) sysMessage(ch, uid, 'groupOwner', { targetId: ownerId });
      return true;
    },
    closeDM(uid, { channelId }) {
      const u = db.users[uid];
      u.closedDMs = u.closedDMs || {};
      u.closedDMs[channelId] = Date.now();
      save();
      return true;
    },

    // ----- Server -----
    createServer(uid, { name, icon }) {
      const id = newId();
      const s = {
        id,
        name: cleanStr(name, 60).trim() || 'Neuer Server',
        icon: cleanUrl(icon),
        banner: '',
        description: '',
        ownerId: uid,
        createdAt: Date.now(),
        roles: [{ id, name: '@everyone', color: '', perms: DEFAULT_PERMS, hoist: false, position: 0 }],
        members: { [uid]: { roles: [], nick: '', avatar: '', joinedAt: Date.now() } },
        bans: {},
        categories: [
          { id: newId(), name: 'Text' },
          { id: newId(), name: 'Sprache' },
        ],
        emojis: [],
        sounds: [],
      };
      db.servers[id] = s;
      const mk = (name, type, cat, position) => {
        const c = { id: newId(), type, serverId: id, name, topic: '', categoryId: cat, position, createdAt: Date.now(), lastMessageId: null };
        db.channels[c.id] = c;
      };
      mk('allgemein', 'text', s.categories[0].id, 0);
      mk('memes', 'text', s.categories[0].id, 1);
      mk('Lounge', 'voice', s.categories[1].id, 0);
      mk('Zocken', 'voice', s.categories[1].id, 1);
      save();
      emitTo([uid], 'serverCreate', serverBundle(s, uid));
      return { id };
    },
    updateServer(uid, { serverId, name, icon, banner, description, systemChannelId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_SERVER));
      if (name !== undefined) s.name = cleanStr(name, 60).trim() || s.name;
      if (icon !== undefined) s.icon = cleanUrl(icon);
      if (banner !== undefined) s.banner = cleanUrl(banner);
      if (description !== undefined) s.description = cleanStr(description, 300);
      if (systemChannelId !== undefined) s.systemChannelId = systemChannelId;
      save();
      for (const m of Object.keys(s.members)) emitTo([m], 'serverUpdate', { id: s.id, name: s.name, icon: s.icon, banner: s.banner, description: s.description, systemChannelId: s.systemChannelId });
      return true;
    },
    deleteServer(uid, { serverId }) {
      const s = db.servers[serverId];
      need(s && s.ownerId === uid, 'Nur der Besitzer kann den Server löschen');
      const members = Object.keys(s.members);
      for (const [vuid, vs] of voice) if (vs.serverId === s.id) leaveVoice(vuid);
      for (const c of Object.values(db.channels)) {
        if (c.serverId === s.id || (c.type === 'thread' && db.channels[c.parentId]?.serverId === s.id)) {
          delete db.messages[c.id];
          delete db.channels[c.id];
        }
      }
      for (const [code, inv] of Object.entries(db.invites)) if (inv.serverId === s.id) delete db.invites[code];
      delete db.servers[serverId];
      save();
      emitTo(members, 'serverDelete', { id: serverId });
      return true;
    },
    transferServer(uid, { serverId, userId }) {
      const s = db.servers[serverId];
      need(s && s.ownerId === uid && s.members[userId], 'Nicht möglich');
      s.ownerId = userId;
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, ownerId: userId });
      return true;
    },
    leaveServer(uid, { serverId }) {
      const s = db.servers[serverId];
      need(s && s.members[uid]);
      need(s.ownerId !== uid, 'Als Besitzer kannst du nicht gehen – übertrage oder lösche den Server');
      removeFromServer(s, uid);
      if (s.systemChannelId !== null) {
        const sys = db.channels[s.systemChannelId] || Object.values(db.channels).find((c) => c.serverId === s.id && c.type === 'text');
        if (sys) sysMessage(sys, uid, 'leave');
      }
      save();
      return true;
    },
    createInvite(uid, { serverId, maxUses = 0, expiresIn = 0 }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.CREATE_INVITE));
      const code = crypto.randomBytes(5).toString('base64url');
      db.invites[code] = { code, serverId, creatorId: uid, uses: 0, maxUses: Number(maxUses) || 0, expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : 0, createdAt: Date.now() };
      save();
      return db.invites[code];
    },
    listInvites(uid, { serverId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_SERVER));
      return Object.values(db.invites).filter((i) => i.serverId === serverId);
    },
    deleteInvite(uid, { code }) {
      const inv = db.invites[code];
      need(inv && has(db.servers[inv.serverId], uid, P.MANAGE_SERVER));
      delete db.invites[code];
      save();
      return true;
    },
    joinInvite(uid, { code }) {
      code = String(code || '').trim().replace(/^.*\//, '');
      const inv = db.invites[code];
      const s = inv && db.servers[inv.serverId];
      need(s, 'Einladung ungültig oder abgelaufen');
      need(!inv.expiresAt || inv.expiresAt > Date.now(), 'Einladung ist abgelaufen');
      need(!inv.maxUses || inv.uses < inv.maxUses, 'Einladung wurde zu oft benutzt');
      need(!s.bans[uid], 'Du wurdest von diesem Server gebannt');
      if (s.members[uid]) return { id: s.id };
      s.members[uid] = { roles: [], nick: '', avatar: '', joinedAt: Date.now() };
      inv.uses++;
      save();
      const members = Object.keys(s.members);
      emitTo(members, 'user', publicUser(db.users[uid]));
      for (const m of members) emitTo([uid], 'user', publicUser(db.users[m]));
      emitTo([uid], 'serverCreate', serverBundle(s, uid));
      emitTo(members.filter((m) => m !== uid), 'memberAdd', { serverId: s.id, userId: uid, member: s.members[uid] });
      for (const [vuid, vs] of voice) if (vs.serverId === s.id) emitTo([uid], 'voiceState', { userId: vuid, state: vs });
      if (s.systemChannelId !== null) {
        const sys = db.channels[s.systemChannelId] || Object.values(db.channels).find((c) => c.serverId === s.id && c.type === 'text');
        if (sys) sysMessage(sys, uid, 'join');
      }
      return { id: s.id };
    },

    // ----- Kanäle -----
    createChannel(uid, { serverId, name, type = 'text', categoryId = null, topic = '', private: priv = false, allowedRoles = [] }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_CHANNELS));
      need(['text', 'voice', 'announce', 'stage', 'forum'].includes(type), 'Unbekannter Kanaltyp');
      const isVoice = type === 'voice' || type === 'stage';
      const n = cleanStr(name, 60).trim();
      const ch = {
        id: newId(),
        type,
        serverId,
        name: isVoice ? n || 'Sprachkanal' : n.toLowerCase().replace(/\s+/g, '-') || 'neuer-kanal',
        topic: cleanStr(topic, 1024),
        categoryId: s.categories.some((c) => c.id === categoryId) ? categoryId : null,
        position: Object.values(db.channels).filter((c) => c.serverId === serverId).length,
        private: !!priv,
        allowedRoles: Array.isArray(allowedRoles) ? allowedRoles : [],
        slowmode: 0,
        userLimit: 0,
        createdAt: Date.now(),
        lastMessageId: null,
      };
      db.channels[ch.id] = ch;
      save();
      emitTo(audience(ch), 'channelCreate', ch);
      return ch;
    },
    updateChannel(uid, { channelId, ...a }) {
      const ch = db.channels[channelId];
      if (ch?.type === 'thread') {
        const s = serverForChannel(ch);
        need(ch.ownerId === uid || has(s, uid, P.MANAGE_MESSAGES));
        if (a.name !== undefined) ch.name = cleanStr(a.name, 100).trim() || ch.name;
        if (a.archived !== undefined) ch.archived = !!a.archived;
        save();
        emitTo(audience(ch), 'channelUpdate', ch);
        return true;
      }
      const s = ch && db.servers[ch.serverId];
      need(has(s, uid, P.MANAGE_CHANNELS));
      const before = new Set(audience(ch));
      if (a.name !== undefined) ch.name = ch.type === 'voice' || ch.type === 'stage' ? cleanStr(a.name, 60).trim() || ch.name : cleanStr(a.name, 60).toLowerCase().replace(/\s+/g, '-') || ch.name;
      if (a.topic !== undefined) ch.topic = cleanStr(a.topic, 1024);
      if (a.categoryId !== undefined) ch.categoryId = s.categories.some((c) => c.id === a.categoryId) ? a.categoryId : null;
      if (a.slowmode !== undefined) ch.slowmode = Math.max(0, Math.min(21600, Number(a.slowmode) || 0));
      if (a.userLimit !== undefined) ch.userLimit = Math.max(0, Math.min(99, Number(a.userLimit) || 0));
      if (a.private !== undefined) ch.private = !!a.private;
      if (a.allowedRoles !== undefined) ch.allowedRoles = Array.isArray(a.allowedRoles) ? a.allowedRoles : [];
      if (a.nsfw !== undefined) ch.nsfw = !!a.nsfw;
      save();
      const after = new Set(audience(ch));
      emitTo([...after], before.size ? 'channelUpdate' : 'channelCreate', ch);
      for (const u of after) if (!before.has(u)) emitTo([u], 'channelCreate', ch);
      for (const u of before) if (!after.has(u)) emitTo([u], 'channelDelete', { id: ch.id });
      return true;
    },
    moveChannel(uid, { channelId, dir, categoryId }) {
      const ch = db.channels[channelId];
      const s = ch && db.servers[ch.serverId];
      need(has(s, uid, P.MANAGE_CHANNELS));
      if (categoryId !== undefined) ch.categoryId = categoryId;
      const list = Object.values(db.channels)
        .filter((c) => c.serverId === s.id && c.categoryId === ch.categoryId)
        .sort((a, b) => a.position - b.position);
      const i = list.indexOf(ch);
      const j = i + (dir || 0);
      if (j >= 0 && j < list.length && dir) [list[i], list[j]] = [list[j], list[i]];
      list.forEach((c, idx) => (c.position = idx));
      save();
      for (const c of list) emitTo(audience(c), 'channelUpdate', c);
      return true;
    },
    deleteChannel(uid, { channelId }) {
      const ch = db.channels[channelId];
      const s = serverForChannel(ch);
      need(ch && (ch.type === 'thread' ? ch.ownerId === uid || has(s, uid, P.MANAGE_MESSAGES) : has(s, uid, P.MANAGE_CHANNELS)));
      const aud = audience(ch);
      for (const [vuid, vs] of voice) if (vs.channelId === ch.id) leaveVoice(vuid);
      for (const t of Object.values(db.channels)) if (t.parentId === ch.id) {
        delete db.channels[t.id];
        delete db.messages[t.id];
        emitTo(aud, 'channelDelete', { id: t.id });
      }
      delete db.channels[channelId];
      delete db.messages[channelId];
      save();
      emitTo(aud, 'channelDelete', { id: channelId });
      return true;
    },
    createCategory(uid, { serverId, name }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_CHANNELS));
      s.categories.push({ id: newId(), name: cleanStr(name, 60) || 'Kategorie' });
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, categories: s.categories });
      return true;
    },
    updateCategory(uid, { serverId, categoryId, name, dir }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_CHANNELS));
      const i = s.categories.findIndex((c) => c.id === categoryId);
      need(i >= 0, 'Kategorie nicht gefunden');
      if (name !== undefined) s.categories[i].name = cleanStr(name, 60) || s.categories[i].name;
      if (dir) {
        const j = i + dir;
        if (j >= 0 && j < s.categories.length) [s.categories[i], s.categories[j]] = [s.categories[j], s.categories[i]];
      }
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, categories: s.categories });
      return true;
    },
    deleteCategory(uid, { serverId, categoryId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_CHANNELS));
      s.categories = s.categories.filter((c) => c.id !== categoryId);
      for (const c of Object.values(db.channels)) if (c.serverId === s.id && c.categoryId === categoryId) {
        c.categoryId = null;
        emitTo(audience(c), 'channelUpdate', c);
      }
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, categories: s.categories });
      return true;
    },

    // ----- Rollen & Mitglieder -----
    createRole(uid, { serverId, name = 'Neue Rolle', color = '', perms }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_ROLES));
      const role = { id: newId(), name: cleanStr(name, 40), color: cleanStr(color, 20), perms: Number(perms ?? s.roles[0].perms) || 0, hoist: false, mentionable: true, position: s.roles.length, icon: '' };
      s.roles.push(role);
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, roles: s.roles });
      return role;
    },
    updateRole(uid, { serverId, roleId, ...a }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_ROLES));
      const r = s.roles.find((x) => x.id === roleId);
      need(r, 'Rolle nicht gefunden');
      if (a.name !== undefined && r.id !== s.id) r.name = cleanStr(a.name, 40);
      if (a.color !== undefined) r.color = cleanStr(a.color, 20);
      if (a.perms !== undefined) {
        let p = Number(a.perms) || 0;
        if (!has(s, uid, P.ADMIN)) p &= memberPerms(s, uid);
        r.perms = p;
      }
      if (a.hoist !== undefined) r.hoist = !!a.hoist;
      if (a.mentionable !== undefined) r.mentionable = !!a.mentionable;
      if (a.icon !== undefined) r.icon = cleanStr(a.icon, 200);
      if (a.dir && r.id !== s.id) {
        const i = s.roles.indexOf(r);
        const j = i + a.dir;
        if (j >= 1 && j < s.roles.length) [s.roles[i], s.roles[j]] = [s.roles[j], s.roles[i]];
        s.roles.forEach((x, idx) => (x.position = idx));
      }
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, roles: s.roles });
      for (const c of Object.values(db.channels)) if (c.serverId === s.id && c.private) for (const m of Object.keys(s.members)) emitTo([m], canView(c, m) ? 'channelCreate' : 'channelDelete', canView(c, m) ? c : { id: c.id });
      return true;
    },
    deleteRole(uid, { serverId, roleId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_ROLES) && roleId !== serverId);
      s.roles = s.roles.filter((r) => r.id !== roleId);
      for (const m of Object.values(s.members)) m.roles = m.roles.filter((r) => r !== roleId);
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, roles: s.roles, members: s.members });
      return true;
    },
    setMemberRoles(uid, { serverId, userId, roles }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_ROLES) && s.members[userId]);
      s.members[userId].roles = (roles || []).filter((r) => s.roles.some((x) => x.id === r && x.id !== s.id));
      save();
      emitTo(Object.keys(s.members), 'memberUpdate', { serverId, userId, member: s.members[userId] });
      for (const c of Object.values(db.channels)) if (c.serverId === s.id && c.private) emitTo([userId], canView(c, userId) ? 'channelCreate' : 'channelDelete', canView(c, userId) ? c : { id: c.id });
      return true;
    },
    setServerProfile(uid, { serverId, userId = uid, nick, avatar, banner, bio }) {
      const s = db.servers[serverId];
      need(s && s.members[userId]);
      if (userId !== uid) need(has(s, uid, P.MANAGE_NICKS));
      else need(has(s, uid, P.CHANGE_NICK) || has(s, uid, P.MANAGE_NICKS));
      const m = s.members[userId];
      if (nick !== undefined) m.nick = cleanStr(nick, 32);
      if (userId === uid) {
        if (avatar !== undefined) m.avatar = cleanUrl(avatar);
        if (banner !== undefined) m.banner = cleanUrl(banner);
        if (bio !== undefined) m.bio = cleanStr(bio, 400);
      }
      save();
      emitTo(Object.keys(s.members), 'memberUpdate', { serverId, userId, member: m });
      return true;
    },
    kick(uid, { serverId, userId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.KICK) && s.members[userId] && userId !== s.ownerId);
      removeFromServer(s, userId);
      save();
      return true;
    },
    ban(uid, { serverId, userId, reason = '', deleteMessages = false }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.BAN) && userId !== s.ownerId && userId !== uid);
      s.bans[userId] = { reason: cleanStr(reason, 300), at: Date.now(), by: uid };
      if (s.members[userId]) removeFromServer(s, userId);
      if (deleteMessages) {
        for (const c of Object.values(db.channels)) if (c.serverId === s.id && db.messages[c.id]) {
          const del = db.messages[c.id].filter((m) => m.authorId === userId);
          db.messages[c.id] = db.messages[c.id].filter((m) => m.authorId !== userId);
          for (const m of del) emitTo(audience(c), 'messageDelete', { channelId: c.id, id: m.id });
        }
      }
      save();
      emitTo(Object.keys(s.members).filter((m) => has(s, m, P.BAN)), 'serverUpdate', { id: s.id, bans: s.bans });
      return true;
    },
    unban(uid, { serverId, userId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.BAN));
      delete s.bans[userId];
      save();
      emitTo(Object.keys(s.members).filter((m) => has(s, m, P.BAN)), 'serverUpdate', { id: s.id, bans: s.bans });
      return true;
    },

    // ----- Emojis & Sounds -----
    addEmoji(uid, { serverId, name, url }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_EMOJIS));
      need(s.emojis.length < 500, 'Maximal 500 Emojis pro Server');
      const n = cleanStr(name, 32).replace(/[^a-zA-Z0-9_]/g, '_') || 'emoji';
      const file = cleanUrl(url).replace('/uploads/', '');
      need(file, 'Ungültiges Bild');
      s.emojis.push({ id: file, name: n, by: uid });
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, emojis: s.emojis });
      return true;
    },
    removeEmoji(uid, { serverId, emojiId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_EMOJIS));
      s.emojis = s.emojis.filter((e) => e.id !== emojiId);
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, emojis: s.emojis });
      return true;
    },
    addSound(uid, { serverId, name, url, emoji = '', volume = 1 }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_EMOJIS));
      need(s.sounds.length < 200, 'Maximal 200 Sounds pro Server');
      const u = cleanUrl(url);
      need(u, 'Ungültige Datei');
      s.sounds.push({ id: newId(), name: cleanStr(name, 32) || 'Sound', url: u, emoji: cleanStr(emoji, 80), volume: Math.max(0, Math.min(1, Number(volume) || 1)), by: uid });
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, sounds: s.sounds });
      return true;
    },
    removeSound(uid, { serverId, soundId }) {
      const s = db.servers[serverId];
      need(has(s, uid, P.MANAGE_EMOJIS));
      s.sounds = s.sounds.filter((x) => x.id !== soundId);
      save();
      emitTo(Object.keys(s.members), 'serverUpdate', { id: s.id, sounds: s.sounds });
      return true;
    },

    // ----- Nachrichten -----
    getMessages(uid, { channelId, before, after, around, limit = 50 }) {
      const ch = db.channels[channelId];
      need(canView(ch, uid));
      const list = db.messages[channelId] || [];
      limit = Math.min(100, limit);
      if (around) {
        const i = list.findIndex((m) => m.id === around);
        if (i < 0) return list.slice(-limit);
        return list.slice(Math.max(0, i - 25), i + 25);
      }
      if (after) return list.filter((m) => m.id > after).slice(0, limit);
      let end = list.length;
      if (before) {
        end = list.findIndex((m) => m.id >= before);
        if (end < 0) end = list.length;
      }
      return list.slice(Math.max(0, end - limit), end);
    },
    sendMessage(uid, { channelId, content = '', attachments = [], replyTo = null, poll = null, nonce, stickers, silent = false, forwardOf = null }) {
      const ch = db.channels[channelId];
      need(canView(ch, uid), 'Kein Zugriff');
      if (ch.archived) ch.archived = false;
      content = String(content).slice(0, MAX_MSG);
      attachments = (Array.isArray(attachments) ? attachments : []).slice(0, 20).map((a) => ({
        url: cleanUrl(a.url), name: cleanStr(a.name, 120), size: Number(a.size) || 0, type: cleanStr(a.type, 100), spoiler: !!a.spoiler, width: a.width | 0, height: a.height | 0, voice: !!a.voice, duration: Number(a.duration) || 0,
      })).filter((a) => a.url);
      need(content.trim() || attachments.length || poll || forwardOf, 'Leere Nachricht');
      const s = serverForChannel(ch);
      if (ch.type === 'dm') {
        const other = ch.recipients.find((r) => r !== uid);
        need(!blockedEither(uid, other), 'Du kannst dieser Person keine Nachrichten senden');
      } else if (s) {
        need(has(s, uid, P.SEND), 'Du darfst hier nicht schreiben');
        if (attachments.length) need(has(s, uid, P.ATTACH), 'Du darfst keine Dateien anhängen');
        if (ch.type === 'announce') need(has(s, uid, P.MANAGE_MESSAGES), 'Nur Moderatoren können hier schreiben');
        if (ch.slowmode && !has(s, uid, P.MANAGE_MESSAGES)) {
          const last = [...(db.messages[ch.id] || [])].reverse().find((m) => m.authorId === uid);
          need(!last || Date.now() - last.createdAt > ch.slowmode * 1000, `Slowmode: warte ${ch.slowmode}s zwischen Nachrichten`);
        }
      }
      const mentions = [...new Set([...content.matchAll(/<@(\w+)>/g)].map((m) => m[1]))];
      const mentionRoles = [...new Set([...content.matchAll(/<@&(\w+)>/g)].map((m) => m[1]))];
      const mentionEveryone = /@(everyone|here)\b/.test(content) && (!s || has(s, uid, P.MENTION_EVERYONE));
      const msg = {
        id: newId(),
        channelId,
        authorId: uid,
        type: 'default',
        content,
        attachments,
        replyTo: replyTo && (db.messages[channelId] || []).some((m) => m.id === replyTo) ? replyTo : null,
        mentions,
        mentionRoles,
        mentionEveryone,
        silent: !!silent,
        reactions: {},
        pinned: false,
        createdAt: Date.now(),
        editedAt: null,
        nonce,
      };
      if (forwardOf) {
        const src = db.channels[forwardOf.channelId];
        const orig = src && canView(src, uid) && (db.messages[src.id] || []).find((m) => m.id === forwardOf.messageId);
        if (orig) msg.forward = { authorId: orig.authorId, content: orig.content, attachments: orig.attachments, createdAt: orig.createdAt, channelId: src.id };
      }
      if (poll && poll.question && Array.isArray(poll.options)) {
        msg.poll = {
          question: cleanStr(poll.question, 300),
          options: poll.options.slice(0, 10).map((o) => ({ id: newId(), text: cleanStr(o.text ?? o, 55), emoji: cleanStr(o.emoji, 80) })).filter((o) => o.text),
          multi: !!poll.multi,
          endsAt: Date.now() + Math.max(1, Math.min(24 * 14, Number(poll.hours) || 24)) * 3600 * 1000,
          votes: {},
        };
        need(msg.poll.options.length >= 2, 'Eine Umfrage braucht mindestens 2 Antworten');
      }
      if (msg.replyTo) {
        const parent = db.messages[channelId].find((m) => m.id === msg.replyTo);
        if (parent && !mentions.includes(parent.authorId) && parent.authorId !== uid) msg.replyPing = parent.authorId;
      }
      (db.messages[channelId] = db.messages[channelId] || []).push(msg);
      ch.lastMessageId = msg.id;
      if (ch.type === 'thread') {
        ch.messageCount = (ch.messageCount || 0) + 1;
        const parent = db.channels[ch.parentId];
        const starter = parent && (db.messages[parent.id] || []).find((m) => m.threadId === ch.id);
        if (starter) {
          starter.thread = { id: ch.id, name: ch.name, count: ch.messageCount, lastAt: msg.createdAt };
          emitTo(audience(parent), 'messageUpdate', starter);
        }
      }
      // Erwähnungs-Zähler
      const aud = audience(ch);
      let pinged = [];
      if (ch.type === 'dm' || ch.type === 'group') pinged = aud;
      else if (mentionEveryone) pinged = aud;
      else {
        pinged = [...mentions, msg.replyPing].filter(Boolean);
        if (mentionRoles.length && s) for (const [m, mem] of Object.entries(s.members)) if (mem.roles.some((r) => mentionRoles.includes(r))) pinged.push(m);
      }
      for (const p of new Set(pinged)) {
        if (p === uid || !aud.includes(p)) continue;
        db.reads[p] = db.reads[p] || {};
        const r = (db.reads[p][channelId] = db.reads[p][channelId] || { last: null, mentions: 0 });
        r.mentions++;
      }
      db.reads[uid] = db.reads[uid] || {};
      db.reads[uid][channelId] = { last: msg.id, mentions: 0 };
      if (ch.type === 'dm' || ch.type === 'group') {
        for (const r of ch.recipients) if (db.users[r]?.closedDMs?.[ch.id]) delete db.users[r].closedDMs[ch.id];
      }
      save();
      emitTo(aud, 'message', msg);
      return msg;
    },
    editMessage(uid, { channelId, messageId, content }) {
      const msg = (db.messages[channelId] || []).find((m) => m.id === messageId);
      need(msg && msg.authorId === uid, 'Nur eigene Nachrichten bearbeitbar');
      msg.content = String(content || '').slice(0, MAX_MSG);
      need(msg.content.trim() || msg.attachments?.length, 'Leere Nachricht');
      msg.editedAt = Date.now();
      msg.mentions = [...new Set([...msg.content.matchAll(/<@(\w+)>/g)].map((m) => m[1]))];
      msg.embedsHidden = false;
      save();
      emitTo(audience(db.channels[channelId]), 'messageUpdate', msg);
      return true;
    },
    suppressEmbeds(uid, { channelId, messageId }) {
      const ch = db.channels[channelId];
      const msg = (db.messages[channelId] || []).find((m) => m.id === messageId);
      need(msg && (msg.authorId === uid || chanPerm(ch, uid, P.MANAGE_MESSAGES)));
      msg.embedsHidden = true;
      save();
      emitTo(audience(ch), 'messageUpdate', msg);
      return true;
    },
    deleteMessage(uid, { channelId, messageId }) {
      const ch = db.channels[channelId];
      const list = db.messages[channelId] || [];
      const msg = list.find((m) => m.id === messageId);
      need(msg, 'Nachricht nicht gefunden');
      need(msg.authorId === uid || (ch.type !== 'dm' && ch.type !== 'group' && chanPerm(ch, uid, P.MANAGE_MESSAGES)));
      db.messages[channelId] = list.filter((m) => m.id !== messageId);
      save();
      emitTo(audience(ch), 'messageDelete', { channelId, id: messageId });
      return true;
    },
    bulkDelete(uid, { channelId, count = 10 }) {
      const ch = db.channels[channelId];
      need(ch && ch.serverId && chanPerm(ch, uid, P.MANAGE_MESSAGES));
      const list = db.messages[channelId] || [];
      const del = list.splice(Math.max(0, list.length - Math.min(100, count)));
      save();
      for (const m of del) emitTo(audience(ch), 'messageDelete', { channelId, id: m.id });
      return del.length;
    },
    react(uid, { channelId, messageId, emoji, remove = false, burst = false }) {
      const ch = db.channels[channelId];
      need(canView(ch, uid) && chanPerm(ch, uid, P.REACT));
      const msg = (db.messages[channelId] || []).find((m) => m.id === messageId);
      need(msg, 'Nachricht nicht gefunden');
      const key = cleanStr(emoji, 120);
      msg.reactions = msg.reactions || {};
      const r = (msg.reactions[key] = msg.reactions[key] || []);
      const i = r.indexOf(uid);
      if (remove && i >= 0) r.splice(i, 1);
      if (!remove && i < 0) {
        need(Object.keys(msg.reactions).length <= 20 || r.length, 'Zu viele verschiedene Reaktionen');
        r.push(uid);
      }
      if (!r.length) delete msg.reactions[key];
      if (burst && !remove) {
        msg.burst = msg.burst || {};
        msg.burst[key] = (msg.burst[key] || 0) + 1;
      }
      save();
      emitTo(audience(ch), 'reaction', { channelId, messageId, reactions: msg.reactions, burst: burst && !remove ? { emoji: key, userId: uid } : null });
      return true;
    },
    pin(uid, { channelId, messageId, pinned }) {
      const ch = db.channels[channelId];
      need(canView(ch, uid) && chanPerm(ch, uid, P.MANAGE_MESSAGES));
      const msg = (db.messages[channelId] || []).find((m) => m.id === messageId);
      need(msg, 'Nachricht nicht gefunden');
      msg.pinned = !!pinned;
      save();
      emitTo(audience(ch), 'messageUpdate', msg);
      if (pinned) sysMessage(ch, uid, 'pin', { targetMessage: messageId });
      return true;
    },
    getPins(uid, { channelId }) {
      need(canView(db.channels[channelId], uid));
      return (db.messages[channelId] || []).filter((m) => m.pinned).reverse();
    },
    votePoll(uid, { channelId, messageId, optionId }) {
      const ch = db.channels[channelId];
      need(canView(ch, uid));
      const msg = (db.messages[channelId] || []).find((m) => m.id === messageId);
      need(msg?.poll, 'Keine Umfrage');
      need(msg.poll.endsAt > Date.now(), 'Die Umfrage ist beendet');
      const v = msg.poll.votes;
      const had = (v[optionId] || []).includes(uid);
      if (!msg.poll.multi) for (const k of Object.keys(v)) v[k] = v[k].filter((x) => x !== uid);
      if (had) v[optionId] = (v[optionId] || []).filter((x) => x !== uid);
      else (v[optionId] = v[optionId] || []).push(uid);
      save();
      emitTo(audience(ch), 'messageUpdate', msg);
      return true;
    },
    endPoll(uid, { channelId, messageId }) {
      const msg = (db.messages[channelId] || []).find((m) => m.id === messageId);
      need(msg?.poll && msg.authorId === uid);
      msg.poll.endsAt = Date.now();
      save();
      emitTo(audience(db.channels[channelId]), 'messageUpdate', msg);
      return true;
    },
    search(uid, { serverId, channelId, query = '', from, has: hasType, limit = 50 }) {
      let chans;
      if (channelId) chans = [db.channels[channelId]].filter((c) => canView(c, uid));
      else if (serverId) chans = Object.values(db.channels).filter((c) => (c.serverId === serverId || (c.type === 'thread' && db.channels[c.parentId]?.serverId === serverId)) && canView(c, uid));
      else chans = Object.values(db.channels).filter((c) => (c.type === 'dm' || c.type === 'group') && c.recipients.includes(uid));
      const q = String(query).toLowerCase().trim();
      let fromId = null;
      if (from) fromId = Object.values(db.users).find((u) => u.username === String(from).toLowerCase().replace(/^@/, ''))?.id || '-';
      const out = [];
      for (const c of chans) for (const m of db.messages[c.id] || []) {
        if (m.type === 'system') continue;
        if (fromId && m.authorId !== fromId) continue;
        if (hasType === 'file' && !m.attachments?.length) continue;
        if (hasType === 'image' && !m.attachments?.some((a) => a.type.startsWith('image/'))) continue;
        if (hasType === 'link' && !/https?:\/\//.test(m.content)) continue;
        if (q && !m.content.toLowerCase().includes(q) && !m.attachments?.some((a) => a.name.toLowerCase().includes(q))) continue;
        out.push(m);
      }
      out.sort((a, b) => (a.id < b.id ? 1 : -1));
      return { total: out.length, results: out.slice(0, limit) };
    },
    typing(uid, { channelId }) {
      const ch = db.channels[channelId];
      if (!canView(ch, uid)) return false;
      emitTo(audience(ch).filter((x) => x !== uid), 'typing', { channelId, userId: uid });
      return true;
    },
    markRead(uid, { channelId, messageId }) {
      if (!canView(db.channels[channelId], uid)) return false;
      db.reads[uid] = db.reads[uid] || {};
      db.reads[uid][channelId] = { last: messageId || db.channels[channelId].lastMessageId, mentions: 0 };
      save();
      emitTo([uid], 'read', { channelId, ...db.reads[uid][channelId] });
      return true;
    },
    markUnread(uid, { channelId, messageId }) {
      if (!canView(db.channels[channelId], uid)) return false;
      const list = db.messages[channelId] || [];
      const i = list.findIndex((m) => m.id === messageId);
      db.reads[uid] = db.reads[uid] || {};
      db.reads[uid][channelId] = { last: i > 0 ? list[i - 1].id : '0', mentions: 0 };
      save();
      emitTo([uid], 'read', { channelId, ...db.reads[uid][channelId] });
      return true;
    },
    createThread(uid, { channelId, messageId, name }) {
      const parent = db.channels[channelId];
      need(parent && parent.serverId && canView(parent, uid), 'Threads gibt es nur in Server-Kanälen');
      need(has(db.servers[parent.serverId], uid, P.CREATE_THREADS));
      const starter = messageId && (db.messages[channelId] || []).find((m) => m.id === messageId);
      if (starter?.threadId && db.channels[starter.threadId]) return db.channels[starter.threadId];
      const th = { id: newId(), type: 'thread', parentId: channelId, serverId: null, name: cleanStr(name, 100).trim() || (starter?.content || 'Thread').slice(0, 40), ownerId: uid, messageId: messageId || null, archived: false, messageCount: 0, createdAt: Date.now(), lastMessageId: null };
      db.channels[th.id] = th;
      if (starter) {
        starter.threadId = th.id;
        starter.thread = { id: th.id, name: th.name, count: 0, lastAt: Date.now() };
        emitTo(audience(parent), 'messageUpdate', starter);
      }
      save();
      emitTo(audience(parent), 'channelCreate', th);
      if (!starter && parent.type !== 'forum') sysMessage(parent, uid, 'thread', { targetId: th.id });
      return th;
    },
    getUserProfile(uid, { userId }) {
      const u = db.users[userId];
      need(u, 'Unbekannter Nutzer');
      const mutualServers = userServers(uid).filter((s) => s.members[userId]).map((s) => s.id);
      const myFriends = Object.entries(db.rel[uid] || {}).filter(([, t]) => t === 'friend').map(([id]) => id);
      const mutualFriends = myFriends.filter((id) => rel(userId, id) === 'friend');
      return { user: publicUser(u), mutualServers, mutualFriends, note: db.users[uid].notes?.[userId] || '' };
    },

    // ----- Voice -----
    voiceJoin(uid, { channelId, muted = false, deafened = false }, socket) {
      const ch = db.channels[channelId];
      need(canView(ch, uid), 'Kein Zugriff');
      need(['voice', 'stage', 'dm', 'group'].includes(ch.type), 'Kein Sprachkanal');
      const s = serverForChannel(ch);
      if (s) need(has(s, uid, P.CONNECT), 'Du darfst diesem Kanal nicht beitreten');
      if (ch.type === 'dm') need(!blockedEither(...ch.recipients), 'Anruf nicht möglich');
      const inChan = [...voice.entries()].filter(([id, v]) => v.channelId === channelId && id !== uid);
      if (ch.userLimit && s && !has(s, uid, P.MOVE_MEMBERS)) need(inChan.length < ch.userLimit, 'Der Kanal ist voll');
      if (voice.has(uid)) {
        const old = voice.get(uid);
        if (old.socketId !== socket.id) io.to(old.socketId).emit('ev', 'voiceKicked', { reason: 'Auf anderem Gerät verbunden' });
        leaveVoice(uid);
      }
      const state = {
        channelId,
        serverId: s?.id || null,
        socketId: socket.id,
        muted: !!muted,
        deafened: !!deafened,
        serverMuted: false,
        serverDeafened: false,
        video: false,
        cameraStreamId: null,
        screenStreamId: null,
        screenInfo: null,
        joinedAt: Date.now(),
        suppressed: ch.type === 'stage' && !(s && has(s, uid, P.MUTE_MEMBERS)),
      };
      voice.set(uid, state);
      emitTo(audience(ch), 'voiceState', { userId: uid, state });
      if ((ch.type === 'dm' || ch.type === 'group') && !inChan.length) {
        emitTo(ch.recipients.filter((r) => r !== uid), 'call', { channelId, from: uid });
      }
      return { peers: inChan.map(([id]) => id) };
    },
    voiceLeave(uid, a, socket) {
      const vs = voice.get(uid);
      if (vs && vs.socketId === socket.id) leaveVoice(uid);
      return true;
    },
    voiceUpdate(uid, a, socket) {
      const vs = voice.get(uid);
      if (!vs || vs.socketId !== socket.id) return false;
      for (const k of ['muted', 'deafened', 'video']) if (a[k] !== undefined) vs[k] = !!a[k];
      if (a.cameraStreamId !== undefined) vs.cameraStreamId = a.cameraStreamId || null;
      if (a.screenStreamId !== undefined) vs.screenStreamId = a.screenStreamId || null;
      if (a.screenInfo !== undefined) vs.screenInfo = a.screenInfo || null;
      if (a.screenStreamId) {
        const s = vs.serverId && db.servers[vs.serverId];
        if (s) need(has(s, uid, P.STREAM), 'Du darfst hier nicht streamen');
      }
      emitTo(audience(db.channels[vs.channelId]), 'voiceState', { userId: uid, state: vs });
      return true;
    },
    voiceModerate(uid, { userId, serverMuted, serverDeafened, moveTo, disconnect, suppressed }) {
      const vs = voice.get(userId);
      need(vs && vs.serverId, 'Nicht in einem Server-Sprachkanal');
      const s = db.servers[vs.serverId];
      if (serverMuted !== undefined || serverDeafened !== undefined || suppressed !== undefined) need(has(s, uid, P.MUTE_MEMBERS) || (suppressed === false && userId === uid && false));
      if (serverMuted !== undefined) vs.serverMuted = !!serverMuted;
      if (serverDeafened !== undefined) vs.serverDeafened = !!serverDeafened;
      if (suppressed !== undefined) vs.suppressed = !!suppressed;
      if (disconnect) {
        need(has(s, uid, P.MOVE_MEMBERS));
        io.to(vs.socketId).emit('ev', 'voiceKicked', { reason: 'Von einem Moderator getrennt' });
        leaveVoice(userId);
        return true;
      }
      if (moveTo) {
        need(has(s, uid, P.MOVE_MEMBERS));
        const target = db.channels[moveTo];
        need(target && target.serverId === s.id && target.type === 'voice');
        io.to(vs.socketId).emit('ev', 'voiceMove', { channelId: moveTo });
        return true;
      }
      emitTo(audience(db.channels[vs.channelId]), 'voiceState', { userId, state: vs });
      return true;
    },
    requestToSpeak(uid) {
      const vs = voice.get(uid);
      need(vs);
      vs.requestToSpeak = Date.now();
      emitTo(audience(db.channels[vs.channelId]), 'voiceState', { userId: uid, state: vs });
      return true;
    },
    rtc(uid, { to, data }) {
      const mine = voice.get(uid);
      const theirs = voice.get(to);
      if (!mine || !theirs || mine.channelId !== theirs.channelId) return false;
      io.to(theirs.socketId).emit('ev', 'rtc', { from: uid, data });
      return true;
    },
    declineCall(uid, { channelId }) {
      const ch = db.channels[channelId];
      if (!ch || !ch.recipients?.includes(uid)) return false;
      emitTo(ch.recipients, 'callDeclined', { channelId, userId: uid });
      return true;
    },
    ringAgain(uid, { channelId }) {
      const ch = db.channels[channelId];
      need(ch?.recipients?.includes(uid));
      emitTo(ch.recipients.filter((r) => r !== uid && voice.get(r)?.channelId !== channelId), 'call', { channelId, from: uid });
      return true;
    },
    soundboard(uid, { soundId, emoji }) {
      const vs = voice.get(uid);
      if (!vs) return false;
      emitTo(audience(db.channels[vs.channelId]), 'soundboard', { userId: uid, channelId: vs.channelId, soundId, emoji });
      return true;
    },
    setActivity(uid, { activity }) {
      const u = db.users[uid];
      u.activity = activity ? { name: cleanStr(activity.name, 80), type: cleanStr(activity.type, 20), since: Date.now() } : null;
      emitTo([...relatedUsers(uid), uid], 'activity', { userId: uid, activity: u.activity });
      return true;
    },
  };

  function readyPayload(uid) {
    const me = db.users[uid];
    const servers = userServers(uid).map((s) => serverBundle(s, uid));
    const dms = Object.values(db.channels).filter((c) => (c.type === 'dm' || c.type === 'group') && c.recipients.includes(uid));
    const users = {};
    for (const id of relatedUsers(uid)) if (db.users[id]) users[id] = publicUser(db.users[id]);
    users[uid] = publicUser(me);
    const vstates = {};
    for (const [id, vs] of voice) if (canView(db.channels[vs.channelId], uid)) vstates[id] = vs;
    const activities = {};
    for (const id of Object.keys(users)) if (db.users[id]?.activity && effectiveStatus(id) !== 'offline') activities[id] = db.users[id].activity;
    return {
      me: { ...publicUser(me), status: me.status || 'online', notes: me.notes || {}, closedDMs: me.closedDMs || {} },
      users,
      relationships: db.rel[uid] || {},
      servers,
      dms,
      reads: db.reads[uid] || {},
      voice: vstates,
      activities,
      ui: currentUi,
    };
  }

  io.on('connection', (socket) => {
    const uid = socket.uid;
    socket.join('u:' + uid);
    const wasOffline = !sockets.get(uid)?.size;
    if (!sockets.has(uid)) sockets.set(uid, new Set());
    sockets.get(uid).add(socket);
    socket.emit('ready', readyPayload(uid));
    if (wasOffline) broadcastPresence(uid);

    socket.on('rpc', async (method, args, ack) => {
      if (typeof ack !== 'function') return;
      const fn = Object.prototype.hasOwnProperty.call(H, method) && H[method];
      if (!fn) return ack({ error: 'Unbekannte Aktion' });
      try {
        ack({ data: await fn(uid, args || {}, socket) });
      } catch (e) {
        ack({ error: e.message || 'Fehler' });
      }
    });

    socket.on('disconnect', () => {
      sockets.get(uid)?.delete(socket);
      const vs = voice.get(uid);
      if (vs && vs.socketId === socket.id) leaveVoice(uid);
      if (!sockets.get(uid)?.size) {
        if (db.users[uid]?.activity) {
          db.users[uid].activity = null;
        }
        broadcastPresence(uid);
      }
    });
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      log(`[nook] Server läuft auf Port ${port} – Daten in ${dataDir}`);
      resolve({
        port,
        close: () =>
          new Promise((r) => {
            store.flush();
            io.close();
            httpServer.close(() => r());
          }),
      });
    });
  });
}

module.exports = { startServer };
