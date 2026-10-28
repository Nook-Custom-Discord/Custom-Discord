import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'preact/hooks';
import { S, update, prefs, setPref, openModal, openPopout, openMenu, toast } from './store';
import { act, rpc, upload, sendMessage, loadOlder, loadMessages, displayName, channelTitle, serverIdOf, can, P, fileUrl, scheduleMarkRead, isUnread, allCustomEmojis, sortedChannels, navigate, jumpTo, avatarOf, openDM, pickFile } from './api';
import { Avatar, ChannelIcon, GroupIcon, fmtDay, fmtSize, fmtDateTime, Name, Spinner, fmtDuration, onlineCount } from './ui';
import { Icon } from './icons';
import { MessageGroup, Message, Md } from './message';
import { BY_NAME, searchEmojis, EMOTICONS } from './emoji';
import { V } from './voice';
import { pushRecent } from './picker';

const GROUP_GAP = 7 * 60 * 1000;

// ---------- Nachrichtenliste ----------
function MessageList({ ch }) {
  const box = S.messages[ch.id];
  const serverId = serverIdOf(ch);
  const scroller = useRef();
  const atBottom = useRef(true);
  const prevHeight = useRef(0);
  const prevFirst = useRef(null);
  const [lastRead] = useState(() => S.reads[ch.id]?.last || null);
  const list = box?.list || [];

  const groups = (() => {
    const out = [];
    let cur = null;
    let lastDay = null;
    let newShown = false;
    for (const m of list) {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        out.push({ sep: 'day', ts: m.createdAt, key: 'd' + m.id });
        lastDay = day;
        cur = null;
      }
      if (!newShown && lastRead && m.id > lastRead && m.authorId !== S.me.id && !m.pending) {
        newShown = true;
        if (out.length > 1 || list[0] !== m) {
          out.push({ sep: 'new', key: 'n' + m.id });
          cur = null;
        }
      }
      if (m.type === 'system') {
        out.push({ msgs: [m], key: m.id, system: true });
        cur = null;
        continue;
      }
      if (cur && cur.msgs[0].authorId === m.authorId && m.createdAt - cur.msgs[cur.msgs.length - 1].createdAt < GROUP_GAP && !m.replyTo && cur.msgs.length < 30) {
        cur.msgs.push(m);
      } else {
        cur = { msgs: [m], key: m.id };
        out.push(cur);
      }
    }
    return out;
  })();

  const prevLast = useRef(null);
  // Scroll-Position halten
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = list[0]?.id;
    const last = list[list.length - 1];
    // Eigene neue Nachricht -> immer nach unten
    if (last && last.id !== prevLast.current && last.authorId === S.me.id && last.pending) atBottom.current = true;
    if (prevFirst.current && first !== prevFirst.current && prevHeight.current && !atBottom.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirst.current = first;
    prevLast.current = last?.id || null;
    prevHeight.current = el.scrollHeight;
  });

  // Größenänderungen (Eingabefeld wächst, Antwort-Leiste, Fenster) -> unten bleiben
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    atBottom.current = true;
    prevFirst.current = null;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ch.id]);

  // Zu Nachricht springen
  useEffect(() => {
    if (!S.focusMsg) return;
    const el = scroller.current?.querySelector(`[data-mid="${S.focusMsg.id}"]`);
    if (el) {
      atBottom.current = false;
      el.scrollIntoView({ block: 'center' });
    }
  }, [S.focusMsg?.at, list.length]);

  // Bilder laden nach -> unten bleiben
  useEffect(() => {
    const el = scroller.current;
    const onLoad = () => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      prevHeight.current = el.scrollHeight;
    };
    el?.addEventListener('load', onLoad, true);
    return () => el?.removeEventListener('load', onLoad, true);
  }, []);

  const [, rerender] = useState(0);
  const onScroll = async (e) => {
    const el = e.target;
    // nie seitlich verschieben (überstehende Elemente können die Liste sonst seitlich scrollen)
    if (el.scrollLeft) el.scrollLeft = 0;
    const was = atBottom.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    prevHeight.current = el.scrollHeight;
    if (atBottom.current && S.focused) scheduleMarkRead(ch.id);
    if (el.scrollTop < 400 && box?.hasMore && !box.loading) {
      await loadOlder(ch.id);
    }
    if (was !== atBottom.current) rerender((x) => x + 1);
  };

  const showJump = box?.detached || !atBottom.current;

  return (
    <>
      <div class="msgs" ref={scroller} onScroll={onScroll}>
        <div class="msgs-inner">
          {box && !box.hasMore && <ChatStart ch={ch} />}
          {box?.loading && (
            <div class="row" style={{ justifyContent: 'center', padding: 20 }}>
              <Spinner />
            </div>
          )}
          {groups.map((g) =>
            g.sep === 'day' ? (
              <div class="day-sep" key={g.key}>
                <span>{fmtDay(g.ts)}</span>
              </div>
            ) : g.sep === 'new' ? (
              <div class="new-sep" key={g.key}>
                <span>Neue Nachrichten</span>
              </div>
            ) : g.system ? (
              <Message key={g.key} m={g.msgs[0]} ch={ch} serverId={serverId} />
            ) : (
              <MessageGroup key={g.key} msgs={g.msgs} ch={ch} serverId={serverId} />
            )
          )}
        </div>
      </div>
      {showJump && list.length > 0 && (
        <button
          class="btn sm jump-btn"
          onClick={async () => {
            if (box?.detached) await loadMessages(ch.id, true);
            atBottom.current = true;
            const el = scroller.current;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            rerender((x) => x + 1);
          }}
        >
          <Icon name="arrowDown" size={16} /> Zu den neuesten Nachrichten
        </button>
      )}
    </>
  );
}

function ChatStart({ ch }) {
  if (ch.type === 'dm') {
    const other = ch.recipients.find((r) => r !== S.me.id);
    return (
      <div class="chat-start">
        <Avatar uid={other} size={80} />
        <h2 style={{ marginTop: 14 }}>{displayName(other)}</h2>
        <p style={{ fontWeight: 700, color: 'var(--text2)' }}>@{S.users[other]?.username}</p>
        <p style={{ marginTop: 8 }}>Nur ihr zwei – schreib <b>{displayName(other)}</b> die erste Nachricht. 👋</p>
      </div>
    );
  }
  if (ch.type === 'group') return <GroupStart ch={ch} />;
  if (ch.type === 'thread')
    return (
      <div class="chat-start">
        <div class="big">
          <ChannelIcon ch={ch} size={36} />
        </div>
        <h2>{ch.name}</h2>
        <p>Hier beginnt der Thread.</p>
      </div>
    );
  // Server-Kanal: großer Kopfbereich mit Schnellaktionen
  const serverId = ch.serverId;
  const acts = [
    can(serverId, P.CREATE_INVITE) && ['userPlus', 'Freunde einladen', 'Einladungslink teilen', () => openModal('invite', { serverId })],
    ['bell', 'Benachrichtigungen', 'Wann du gepingt wirst', () => openModal('notif', { serverId, channelId: ch.id })],
    can(serverId, P.MANAGE_CHANNELS) && ['edit', 'Kanal anpassen', 'Name, Thema & Rechte', () => openModal('channelSettings', { channelId: ch.id })],
  ].filter(Boolean);
  return (
    <div class="chat-start group-start chan-hero">
      <div class="gs-hero">
        <div class="big-ic">
          <ChannelIcon ch={ch} size={40} />
        </div>
        <div class="grow" style={{ minWidth: 0 }}>
          <h2 class="ellipsis">{ch.name}</h2>
          <p>{ch.topic || `Frisch auf ${S.servers[serverId]?.name || 'diesem Server'} – hier ist noch alles leer. Schreib was! ✍️`}</p>
        </div>
      </div>
      <div class="gs-actions">
        {acts.map(([icon, title, sub, fn]) => (
          <button class="gs-act" onClick={fn}>
            <Icon name={icon} />
            <b>{title}</b>
            <span>{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GroupStart({ ch }) {
  const members = ch.recipients;
  return (
    <div class="chat-start group-start" style={{ '--gc': ch.color || 'var(--accent)' }}>
      <div class="gs-hero">
        <GroupIcon ch={ch} size={84} />
        <div class="grow" style={{ minWidth: 0 }}>
          <h2 class="ellipsis">{channelTitle(ch)}</h2>
          <p>{ch.topic || 'Willkommen am Anfang eurer Gruppe! Hier beginnt alles.'}</p>
          <div class="gs-members">
            <div class="gs-stack">
              {members.slice(0, 6).map((id) => (
                <span onClick={(e) => openPopout(e, 'profile', { uid: id })}>
                  <Avatar uid={id} size={28} deco={false} />
                </span>
              ))}
            </div>
            <span>
              {members.length} Mitglieder · <b style={{ color: 'var(--ok)' }}>{onlineCount(members)} online</b>
            </span>
          </div>
        </div>
      </div>
      <div class="gs-actions">
        <button class="gs-act" onClick={() => openModal('createGroup', { channelId: ch.id })}>
          <Icon name="userPlus" />
          <b>Freunde einladen</b>
          <span>Bis zu 25 Leute</span>
        </button>
        <button class="gs-act" onClick={() => V.join(ch.id)}>
          <Icon name="phone" />
          <b>Anruf starten</b>
          <span>Sprache, Video & Bildschirm</span>
        </button>
        <button class="gs-act" onClick={() => openModal('groupSettings', { channelId: ch.id })}>
          <Icon name="edit" />
          <b>Gruppe anpassen</b>
          <span>Bild, Farbe & Beschreibung</span>
        </button>
      </div>
    </div>
  );
}

function TypingBar({ chId }) {
  const t = S.typing[chId] || {};
  const now = Date.now();
  const ids = Object.entries(t)
    .filter(([id, exp]) => exp > now && id !== S.me.id && S.rel[id] !== 'blocked')
    .map(([id]) => id);
  const sid = serverIdOf(S.channels[chId]);
  let text = '';
  if (ids.length === 1) text = <><b>{displayName(ids[0], sid)}</b> schreibt …</>;
  else if (ids.length === 2) text = <><b>{displayName(ids[0], sid)}</b> und <b>{displayName(ids[1], sid)}</b> schreiben …</>;
  else if (ids.length > 2) text = 'Mehrere Leute schreiben …';
  const ch = S.channels[chId];
  return (
    <div class="typing">
      {ids.length > 0 && (
        <>
          <span class="dots">
            <i />
            <i />
            <i />
          </span>
          <span>{text}</span>
        </>
      )}
      {ch?.slowmode > 0 && <span class="muted" style={{ marginLeft: 'auto' }}>🐢 Slowmode: {ch.slowmode}s</span>}
    </div>
  );
}

// ---------- Eingabe ----------
const SLASH = [
  { name: 'shrug', desc: 'Hängt ¯\\_(ツ)_/¯ an', run: (t) => (t + ' ¯\\_(ツ)_/¯').trim() },
  { name: 'tableflip', desc: '(╯°□°)╯︵ ┻━┻', run: (t) => (t + ' (╯°□°)╯︵ ┻━┻').trim() },
  { name: 'unflip', desc: '┬─┬ノ( º _ ºノ)', run: (t) => (t + ' ┬─┬ノ( º _ ºノ)').trim() },
  { name: 'lenny', desc: '( ͡° ͜ʖ ͡°)', run: (t) => (t + ' ( ͡° ͜ʖ ͡°)').trim() },
  { name: 'me', desc: 'Text kursiv als Aktion', run: (t) => `_${t}_` },
  { name: 'spoiler', desc: 'Nachricht als Spoiler', run: (t) => `||${t}||` },
  { name: 'poll', desc: 'Umfrage erstellen', action: 'poll' },
  { name: 'nick', desc: 'Deinen Nickname auf diesem Server ändern', action: 'nick' },
  { name: 'thread', desc: 'Neuen Thread starten', action: 'thread' },
  { name: 'silent', desc: 'Ohne Benachrichtigung senden', action: 'silent' },
  { name: 'timestamp', desc: 'Zeitstempel einfügen (z. B. jetzt)', run: (t) => `${t ? t + ' ' : ''}<t:${Math.floor(Date.now() / 1000)}:R>` },
];

function useAutocomplete(text, caret, ch) {
  return useMemo(() => {
    const before = text.slice(0, caret);
    const sid = serverIdOf(ch);
    let m;
    if ((m = /^\/(\w*)$/.exec(before))) {
      return { type: 'slash', start: 0, items: SLASH.filter((c) => c.name.startsWith(m[1].toLowerCase())).map((c) => ({ ...c, insert: '/' + c.name + ' ' })) };
    }
    if ((m = /(^|\s)@([\w.]*)$/.exec(before))) {
      const q = m[2].toLowerCase();
      let ids;
      if (sid) ids = Object.keys(S.servers[sid]?.members || {});
      else ids = ch.recipients || [];
      const users = ids
        .filter((id) => S.users[id])
        .filter((id) => !q || S.users[id].username.includes(q) || displayName(id, sid).toLowerCase().includes(q))
        .slice(0, 8)
        .map((id) => ({ kind: 'user', id, insert: '@' + S.users[id].username + ' ' }));
      const roles = sid ? S.servers[sid].roles.filter((r) => r.id !== sid && r.mentionable !== false && r.name.toLowerCase().includes(q)).slice(0, 5).map((r) => ({ kind: 'role', role: r, insert: '@' + r.name + ' ' })) : [];
      const special = sid && can(sid, P.MENTION_EVERYONE) ? ['everyone', 'here'].filter((x) => x.startsWith(q)).map((x) => ({ kind: 'special', name: x, insert: '@' + x + ' ' })) : [];
      return { type: 'mention', start: caret - m[2].length - 1, items: [...users, ...roles, ...special] };
    }
    if (sid && (m = /(^|\s)#([\w-]*)$/.exec(before))) {
      const q = m[2].toLowerCase();
      return { type: 'channel', start: caret - m[2].length - 1, items: sortedChannels(sid).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10).map((c) => ({ kind: 'channel', ch: c, insert: '#' + c.name + ' ' })) };
    }
    if ((m = /(^|\s):(\w{2,})$/.exec(before))) {
      const q = m[2].toLowerCase();
      const custom = allCustomEmojis().filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8).map((e) => ({ kind: 'cemoji', e, insert: `<:${e.name}:${e.id}> ` }));
      const uni = searchEmojis(q, 10).map((e) => ({ kind: 'emoji', e, insert: e.char + ' ' }));
      return { type: 'emoji', start: caret - m[2].length - 1, items: [...custom, ...uni] };
    }
    return null;
  }, [text, caret, ch.id]);
}

function transformOutgoing(text, ch) {
  const sid = serverIdOf(ch);
  const ids = sid ? Object.keys(S.servers[sid]?.members || {}) : ch.recipients || [];
  const byUser = new Map(ids.filter((id) => S.users[id]).map((id) => [S.users[id].username, id]));
  // Codeblöcke nicht anfassen
  const parts = text.split(/(```[\s\S]*?```|`[^`]*`)/);
  return parts
    .map((p, i) => {
      if (i % 2) return p;
      if (sid) {
        const roles = [...S.servers[sid].roles].filter((r) => r.id !== sid).sort((a, b) => b.name.length - a.name.length);
        for (const r of roles) p = p.split('@' + r.name).join(`<@&${r.id}>`);
        for (const c of sortedChannels(sid)) p = p.replace(new RegExp(`(^|\\s)#${c.name.replace(/[-]/g, '\\-')}(?![\\w-])`, 'g'), `$1<#${c.id}>`);
      }
      p = p.replace(/(^|[^\w<])@([a-z0-9_.]{2,32})/g, (all, pre, name) => (byUser.has(name) ? `${pre}<@${byUser.get(name)}>` : all));
      p = p.replace(/(^|[^<\w]):(\w{2,32}):/g, (all, pre, name) => {
        if (BY_NAME.has(name)) return pre + BY_NAME.get(name);
        const ce = allCustomEmojis().find((e) => e.name === name);
        return ce ? `${pre}<:${ce.name}:${ce.id}>` : all;
      });
      for (const [k, v] of Object.entries(EMOTICONS)) p = p.replace(new RegExp(`(^|\\s)${k.replace(/[()[\]|*.?+^$\\]/g, '\\$&')}(?=\\s|$)`, 'g'), '$1' + v);
      return p;
    })
    .join('');
}

let typingSent = 0;

export function Composer({ ch }) {
  const sid = serverIdOf(ch);
  const ta = useRef();
  const wrap = useRef();
  const [text, setText] = useState(S.drafts[ch.id] || '');
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [files, setFiles] = useState([]);
  const [recording, setRecording] = useState(null);
  const [acClosed, setAcClosed] = useState(false);
  const reply = S.replyTo[ch.id];
  const ac = useAutocomplete(text, caret, ch);
  const acOpen = ac && ac.items.length > 0 && !acClosed;

  useEffect(() => {
    setText(S.drafts[ch.id] || '');
    setFiles([]);
    ta.current?.focus();
  }, [ch.id]);

  // Höhe des Schreibfelds merken: im Liquid-Glass-Modus laufen die Nachrichten darunter durch
  useEffect(() => {
    const el = wrap.current;
    const chat = el?.closest('.chat');
    if (!chat || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => chat.style.setProperty('--composer-h', el.offsetHeight + 'px'));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setSel(0);
  }, [ac?.type, ac?.items.length]);
  useEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, innerHeight * 0.4) + 'px';
  }, [text]);

  // Dateien per Drag&Drop / Einfügen
  useEffect(() => {
    const onFiles = (e) => addFiles(e.detail);
    window.addEventListener('nook-files', onFiles);
    return () => window.removeEventListener('nook-files', onFiles);
  });

  let blocked = false;
  let placeholder = `Nachricht an ${ch.type === 'dm' ? '@' : ch.type === 'group' ? '' : '#'}${channelTitle(ch)}`;
  if (sid) {
    if (!can(sid, P.SEND)) {
      blocked = true;
      placeholder = 'Du hast keine Berechtigung, hier zu schreiben';
    } else if (ch.type === 'announce' && !can(sid, P.MANAGE_MESSAGES)) {
      blocked = true;
      placeholder = 'Nur Moderatoren können in Ankündigungen schreiben';
    }
  }
  if (ch.type === 'dm') {
    const other = ch.recipients.find((r) => r !== S.me.id);
    if (S.rel[other] === 'blocked') {
      blocked = true;
      placeholder = 'Du hast diese Person blockiert';
    }
  }

  const setDraft = (v) => {
    setText(v);
    S.drafts[ch.id] = v;
    setAcClosed(false);
  };

  function addFiles(list) {
    if (sid && !can(sid, P.ATTACH)) return toast('Du darfst hier keine Dateien anhängen', 'error');
    const items = [...list].map((file) => ({ id: Math.random(), file, progress: 0, result: null, spoiler: false, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }));
    setFiles((f) => [...f, ...items].slice(0, 20));
    for (const it of items) {
      it.promise = upload(it.file, (p) => {
        it.progress = p;
        setFiles((f) => [...f]);
      })
        .then(async (r) => {
          if (it.file.type.startsWith('image/') && it.preview) {
            const dim = await new Promise((res) => {
              const img = new Image();
              img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
              img.onerror = () => res({});
              img.src = it.preview;
            });
            Object.assign(r, dim);
          }
          it.result = r;
          setFiles((f) => [...f]);
          return r;
        })
        .catch((e) => {
          toast(e.message, 'error');
          setFiles((f) => f.filter((x) => x !== it));
          return null;
        });
    }
  }

  const insert = (str, start = caret, end = caret) => {
    const v = text.slice(0, start) + str + text.slice(end);
    setDraft(v);
    const pos = start + str.length;
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const applyAc = (item) => {
    if (ac.type === 'slash' && item.action === 'poll') {
      setDraft('');
      return openModal('poll', { channelId: ch.id });
    }
    insert(item.insert, ac.start, caret);
  };

  const send = async () => {
    let content = text.trim();
    let silent = false;
    const m = /^\/(\w+)\s*([\s\S]*)$/.exec(content);
    if (m) {
      const cmd = SLASH.find((c) => c.name === m[1].toLowerCase());
      if (cmd?.action === 'poll') {
        setDraft('');
        return openModal('poll', { channelId: ch.id, question: m[2] });
      }
      if (cmd?.action === 'nick') {
        if (!sid) return toast('Nicknames gibt es nur auf Servern', 'error');
        await act('setServerProfile', { serverId: sid, nick: m[2] }, m[2] ? `Nickname: ${m[2]}` : 'Nickname zurückgesetzt');
        return setDraft('');
      }
      if (cmd?.action === 'thread') {
        if (!sid || ch.type === 'thread') return toast('Threads gehen nur in Server-Kanälen', 'error');
        const th = await act('createThread', { channelId: ch.id, name: m[2] || 'Neuer Thread' });
        S.channels[th.id] = th;
        navigate(sid, ch.id, th.id);
        return setDraft('');
      }
      if (cmd?.action === 'silent') {
        silent = true;
        content = m[2];
      } else if (cmd?.run) content = cmd.run(m[2]);
    }
    if (files.some((f) => !f.result)) toast('Warte auf Uploads …');
    const results = (await Promise.all(files.map((f) => f.promise))).filter(Boolean).map((r, i) => ({ ...r, spoiler: files[i]?.spoiler }));
    if (!content && !results.length) return;
    content = transformOutgoing(content, ch);
    const payload = { content, attachments: results, silent };
    if (reply) {
      payload.replyTo = reply.id;
      if (!reply.ping) payload.content = payload.content; // Ping wird serverseitig über replyPing geregelt
    }
    setDraft('');
    setFiles([]);
    delete S.replyTo[ch.id];
    typingSent = 0;
    // Chunk lange Nachrichten
    if (content.length > 6000) {
      for (let i = 0; i < content.length; i += 6000) await sendMessage(ch.id, { ...payload, content: content.slice(i, i + 6000), attachments: i ? [] : results });
    } else sendMessage(ch.id, payload);
    update();
  };

  const onKey = (e) => {
    if (acOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        return setSel((s) => (s + 1) % ac.items.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        return setSel((s) => (s - 1 + ac.items.length) % ac.items.length);
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        return applyAc(ac.items[sel]);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        return setAcClosed(true);
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && prefs.sendOnEnter && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Enter' && e.ctrlKey && !prefs.sendOnEnter) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Escape' && reply) {
      delete S.replyTo[ch.id];
      update();
    }
    if (e.key === 'ArrowUp' && !text) {
      const mine = [...(S.messages[ch.id]?.list || [])].reverse().find((m) => m.authorId === S.me.id && m.content && !m.pending);
      if (mine) {
        e.preventDefault();
        S.editing = { id: mine.id, channelId: ch.id, text: mine.content };
        update();
      }
    }
  };

  const onInput = (e) => {
    setDraft(e.target.value);
    setCaret(e.target.selectionStart);
    if (Date.now() - typingSent > 5000 && e.target.value && !e.target.value.startsWith('/')) {
      typingSent = Date.now();
      rpc('typing', { channelId: ch.id }).catch(() => {});
    }
  };

  const onPaste = (e) => {
    const fl = [...(e.clipboardData?.files || [])];
    if (fl.length) {
      e.preventDefault();
      addFiles(fl);
    }
  };

  // Sprachnachricht
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : {});
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const started = Date.now();
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (rec._cancel) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `Sprachnachricht-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`, { type: 'audio/webm' });
        try {
          const r = await upload(file);
          sendMessage(ch.id, { content: '', attachments: [{ ...r, voice: true, duration: (Date.now() - started) / 1000 }], replyTo: reply?.id });
          delete S.replyTo[ch.id];
        } catch (e) {
          toast(e.message, 'error');
        }
      };
      rec.start();
      setRecording({ rec, started });
    } catch {
      toast('Mikrofon nicht verfügbar', 'error');
    }
  };
  const [, force] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [recording]);

  const plusMenu = (e) =>
    openMenu(e, [
      { label: 'Datei hochladen', icon: 'upload', onClick: async () => addFiles(await pickFile('*/*', true)) },
      { label: 'Umfrage erstellen', icon: 'poll', onClick: () => openModal('poll', { channelId: ch.id }) },
      sid && ch.type !== 'thread' && can(sid, P.CREATE_THREADS) && {
        label: 'Thread erstellen',
        icon: 'thread',
        onClick: async () => {
          const th = await act('createThread', { channelId: ch.id, name: 'Neuer Thread' });
          S.channels[th.id] = th;
          navigate(sid, ch.id, th.id);
        },
      },
    ]);

  return (
    <div class="composer-wrap" ref={wrap}>
      {acOpen && (
        <div class="autocomplete">
          <div class="ah">{{ slash: 'Befehle', mention: 'Mitglieder & Rollen', channel: 'Kanäle', emoji: 'Emojis' }[ac.type]}</div>
          {ac.items.map((it, i) => (
            <div class={`ac-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); applyAc(it); }}>
              {it.kind === 'user' && (
                <>
                  <Avatar uid={it.id} size={26} serverId={sid} status deco={false} />
                  <Name uid={it.id} serverId={sid} />
                  <span class="sub">@{S.users[it.id].username}</span>
                </>
              )}
              {it.kind === 'role' && (
                <>
                  <span class="role-dot" style={{ background: it.role.color || 'var(--muted)' }} />
                  <b style={{ color: it.role.color || undefined }}>@{it.role.name}</b>
                  <span class="sub">Rolle</span>
                </>
              )}
              {it.kind === 'special' && (
                <>
                  <b>@{it.name}</b>
                  <span class="sub">{it.name === 'everyone' ? 'Alle in diesem Kanal' : 'Alle Online'}</span>
                </>
              )}
              {it.kind === 'channel' && (
                <>
                  <ChannelIcon ch={it.ch} size={18} /> {it.ch.name}
                </>
              )}
              {it.kind === 'emoji' && (
                <>
                  <span style={{ fontSize: 20 }}>{it.e.char}</span> :{it.e.names[0]}:
                </>
              )}
              {it.kind === 'cemoji' && (
                <>
                  <img class="emoji" src={fileUrl('/uploads/' + it.e.id)} /> :{it.e.name}: <span class="sub">{it.e.serverName}</span>
                </>
              )}
              {ac.type === 'slash' && (
                <>
                  <b>/{it.name}</b>
                  <span class="sub">{it.desc}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div class="composer">
        {reply && (
          <div class="bar-top">
            <span class="grow ellipsis">
              Antwort an <b>{displayName(reply.authorId, sid)}</b>
            </span>
            <button class="ibtn sm" onClick={() => { delete S.replyTo[ch.id]; update(); }}>
              <Icon name="x" />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div class="pending-atts">
            {files.map((f) => (
              <div class="patt">
                <div class="pv" style={f.preview ? { backgroundImage: `url(${f.preview})`, filter: f.spoiler ? 'blur(8px)' : '' } : null}>{!f.preview && <Icon name="file" size={30} />}</div>
                <div class="pn ellipsis">{f.file.name}</div>
                <div class="muted" style={{ fontSize: 11 }}>{fmtSize(f.file.size)}</div>
                {!f.result && <div class="prog" style={{ width: Math.round(f.progress * 100) + '%' }} />}
                <div class="ptools">
                  <button class={`ibtn sm ${f.spoiler ? 'on' : ''}`} data-tip="Als Spoiler markieren" onClick={() => { f.spoiler = !f.spoiler; setFiles([...files]); }}>
                    <Icon name="eye" />
                  </button>
                  <button class="ibtn sm red" data-tip="Entfernen" onClick={() => setFiles(files.filter((x) => x !== f))}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div class="row-in">
          {!blocked && (
            <button class="ibtn" data-tip="Anhängen & mehr" onClick={plusMenu}>
              <Icon name="plus" />
            </button>
          )}
          {recording ? (
            <div class="rec">
              <span class="dot" /> Aufnahme läuft · {fmtDuration((Date.now() - recording.started) / 1000)}
              <span class="grow" />
              <button class="btn ghost sm" onClick={() => { recording.rec._cancel = true; recording.rec.stop(); setRecording(null); }}>
                Verwerfen
              </button>
              <button class="btn sm" onClick={() => { recording.rec.stop(); setRecording(null); }}>
                Senden
              </button>
            </div>
          ) : (
            <textarea
              ref={ta}
              rows={1}
              value={text}
              disabled={blocked}
              placeholder={placeholder}
              spellcheck={prefs.spellcheck}
              onInput={onInput}
              onKeyDown={onKey}
              onKeyUp={(e) => setCaret(e.target.selectionStart)}
              onClick={(e) => setCaret(e.target.selectionStart)}
              onPaste={onPaste}
            />
          )}
          {!blocked && !recording && (
            <>
              <button class="ibtn" data-tip="Emoji" onClick={(e) => openPopout(e, 'emoji', { onPick: (em) => insert(em + ' ', ta.current.selectionStart, ta.current.selectionEnd), prefer: 'top' })}>
                <Icon name="smile" />
              </button>
              {!text.trim() && !files.length ? (
                <button class="ibtn" data-tip="Sprachnachricht aufnehmen" onClick={startRec}>
                  <Icon name="mic" />
                </button>
              ) : (
                <button class="send-btn" onClick={send} data-tip="Senden">
                  <Icon name="send" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Chat-Ansicht ----------
export function ChatView({ ch, embedded = false }) {
  const [drag, setDrag] = useState(false);
  const dragDepth = useRef(0);
  useEffect(() => {
    loadMessages(ch.id);
  }, [ch.id]);
  return (
    <div
      class="chat"
      onDragEnter={(e) => {
        if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
        dragDepth.current++;
        setDrag(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current--;
        if (dragDepth.current <= 0) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDrag(false);
        if (e.dataTransfer.files.length) window.dispatchEvent(new CustomEvent('nook-files', { detail: e.dataTransfer.files }));
      }}
    >
      <MessageList ch={ch} key={ch.id} />
      <TypingBar chId={ch.id} />
      <Composer ch={ch} />
      {drag && <div class="drop-overlay">Dateien hier ablegen zum Hochladen</div>}
    </div>
  );
}

// ---------- Seitenpanel: Thread, Suche, Pins ----------
export function SidePanel() {
  const p = S.panel;
  if (!p) return null;
  const close = () => {
    S.panel = null;
    update();
  };
  if (p.threadId) {
    const th = S.channels[p.threadId];
    if (!th) return null;
    return (
      <div class="side-panel">
        <div class="chead">
          <Icon name="thread" size={20} />
          <div class="title ellipsis grow">{th.name}</div>
          <button class="ibtn sm" data-tip={th.archived ? 'Wiederherstellen' : 'Archivieren'} onClick={() => act('updateChannel', { channelId: th.id, archived: !th.archived })}>
            <Icon name={th.archived ? 'inbox' : 'download'} />
          </button>
          <button class="ibtn sm" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        <ChatView ch={th} embedded />
      </div>
    );
  }
  if (p.search) return <SearchPanel p={p} close={close} />;
  if (p.pins) return <PinsPanel chId={p.pins} close={close} />;
  if (p.threads) return <ThreadsPanel chId={p.threads} close={close} />;
  return null;
}

function SearchPanel({ p, close }) {
  const r = p.search;
  return (
    <div class="side-panel search-res">
      <div class="chead">
        <div class="title grow">{r.loading ? 'Suche …' : `${r.total ?? 0} Ergebnisse`}</div>
        <button class="ibtn sm" onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 10 }}>
        {r.loading && <div class="row" style={{ justifyContent: 'center', padding: 20 }}><Spinner /></div>}
        {(r.results || []).map((m) => {
          const ch = S.channels[m.channelId];
          return (
            <div class="sr" onClick={() => jumpTo(m.channelId, m.id)}>
              <div class="row" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                {ch && ch.serverId && <span>#{ch.name}</span>}
                <span style={{ marginLeft: 'auto' }}>{fmtDateTime(m.createdAt)}</span>
              </div>
              <div class="row" style={{ alignItems: 'flex-start' }}>
                <Avatar uid={m.authorId} size={30} deco={false} />
                <div class="grow" style={{ minWidth: 0 }}>
                  <b>{displayName(m.authorId, serverIdOf(ch))}</b>
                  <Md text={m.content || (m.attachments?.length ? `📎 ${m.attachments.map((a) => a.name).join(', ')}` : '')} serverId={serverIdOf(ch)} />
                </div>
              </div>
            </div>
          );
        })}
        {!r.loading && !r.results?.length && <div class="empty"><div class="art">🔎</div>Nichts gefunden.</div>}
      </div>
    </div>
  );
}

function PinsPanel({ chId, close }) {
  const [pins, setPins] = useState(null);
  const ch = S.channels[chId];
  const pinCount = (S.messages[chId]?.list || []).filter((m) => m.pinned).length;
  useEffect(() => {
    rpc('getPins', { channelId: chId }).then(setPins).catch(() => setPins([]));
  }, [chId, pinCount]);
  return (
    <div class="side-panel search-res">
      <div class="chead">
        <Icon name="pin" size={20} />
        <div class="title grow">Angeheftet</div>
        <button class="ibtn sm" onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 10 }}>
        {!pins && <div class="row" style={{ justifyContent: 'center', padding: 20 }}><Spinner /></div>}
        {pins?.length === 0 && <div class="empty"><div class="art">📌</div>Noch keine angehefteten Nachrichten.</div>}
        {pins?.map((m) => (
          <div class="sr" onClick={() => jumpTo(chId, m.id)}>
            <div class="row" style={{ alignItems: 'flex-start' }}>
              <Avatar uid={m.authorId} size={30} deco={false} />
              <div class="grow" style={{ minWidth: 0 }}>
                <div class="row">
                  <b>{displayName(m.authorId, serverIdOf(ch))}</b>
                  <span class="muted" style={{ fontSize: 12 }}>{fmtDateTime(m.createdAt)}</span>
                </div>
                <Md text={m.content || '📎 Anhang'} serverId={serverIdOf(ch)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadsPanel({ chId, close }) {
  const threads = Object.values(S.channels)
    .filter((c) => c.type === 'thread' && c.parentId === chId)
    .sort((a, b) => ((b.lastMessageId || b.id) > (a.lastMessageId || a.id) ? 1 : -1));
  const ch = S.channels[chId];
  return (
    <div class="side-panel search-res">
      <div class="chead">
        <Icon name="thread" size={20} />
        <div class="title grow">Threads</div>
        <button class="ibtn sm" onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 10 }}>
        {!threads.length && <div class="empty"><div class="art">🧵</div>Noch keine Threads. Rechtsklick auf eine Nachricht → Thread erstellen.</div>}
        {threads.map((t) => (
          <div class="sr" onClick={() => navigate(serverIdOf(ch), chId, t.id)}>
            <div class="row">
              <b class="grow ellipsis">{t.name}</b>
              {t.archived && <span class="chip">archiviert</span>}
              {isUnread(t) && <span class="badge">•</span>}
            </div>
            <div class="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              von {displayName(t.ownerId, serverIdOf(ch))} · {t.messageCount || 0} Nachrichten
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function runSearch(query, ch) {
  const sid = serverIdOf(ch);
  let q = query;
  let from;
  let has;
  q = q.replace(/from:(\S+)/, (_, u) => ((from = u), '')).replace(/has:(file|image|link)/, (_, h) => ((has = h), '')).trim();
  S.panel = { search: { loading: true, query } };
  update();
  try {
    const r = await rpc('search', sid ? { serverId: sid, query: q, from, has } : { channelId: ch.id, query: q, from, has });
    S.panel = { search: { ...r, query } };
  } catch (e) {
    toast(e.message, 'error');
    S.panel = null;
  }
  update();
}
