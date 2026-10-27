import { useState, useRef, useEffect } from 'preact/hooks';
import { S, update, prefs, openMenu, openModal, openPopout, toast, confirmDialog, promptDialog } from './store';
import { act, rpc, fileUrl, displayName, roleColor, can, P, getEmbed, openExternal, copy, jumpTo, navigate, serverIdOf, mentionsMe, openDM, sendMessage } from './api';
import { renderMarkdown, isEmojiOnly, extractUrls } from './markdown';
import { Avatar, Name, fmtTime, fmtDateTime, fmtSize, fmtDuration } from './ui';
import { Icon } from './icons';
import { EmojiPicker, EmojiView, pushRecent } from './picker';

// ---------- Gemeinsame Klick-Behandlung für Markdown ----------
export function onMdClick(e, serverId) {
  const a = e.target.closest('a');
  if (a) {
    e.preventDefault();
    const href = a.getAttribute('href');
    if (/^https?:/.test(href)) openExternal(href);
    return;
  }
  const sp = e.target.closest('.spoiler');
  if (sp) {
    sp.classList.add('shown');
    return;
  }
  const m = e.target.closest('.mention[data-user]');
  if (m) return openPopout({ stopPropagation: () => {}, currentTarget: m }, 'profile', { uid: m.dataset.user, serverId });
  const c = e.target.closest('.mention[data-channel]');
  if (c) {
    const ch = S.channels[c.dataset.channel];
    if (ch) navigate(serverIdOf(ch) || '@me', ch.type === 'thread' ? ch.parentId : ch.id, ch.type === 'thread' ? ch.id : null);
  }
}

export function Md({ text, serverId, inline }) {
  return <div class="md" onClick={(e) => onMdClick(e, serverId)} dangerouslySetInnerHTML={{ __html: renderMarkdown(text, { serverId, inline }) }} />;
}

// ---------- Anhänge ----------
function Attachment({ a, onOpen }) {
  const url = fileUrl(a.url);
  const [spoil, setSpoil] = useState(a.spoiler || a.name?.startsWith('SPOILER_'));
  if (a.voice) return <VoiceMsg a={a} />;
  if (a.type.startsWith('image/')) {
    return (
      <div class={`att-img ${spoil ? 'spoil' : ''}`} onClick={() => (spoil ? setSpoil(false) : onOpen({ type: 'image', url, name: a.name }))}>
        <img src={url} alt={a.name} loading="lazy" style={a.width ? { aspectRatio: `${a.width}/${a.height}`, width: Math.min(a.width, 420) } : null} />
      </div>
    );
  }
  if (a.type.startsWith('video/')) {
    return (
      <div class={`att-img ${spoil ? 'spoil' : ''}`} onClick={() => spoil && setSpoil(false)} style={{ cursor: 'default' }}>
        <video src={url} controls preload="metadata" style={{ maxWidth: 480 }} />
      </div>
    );
  }
  if (a.type.startsWith('audio/')) {
    return (
      <div class="att-audio">
        <div class="row">
          <Icon name="headphones" size={20} />
          <a href={url} class="grow ellipsis" style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); openExternal(url); }}>
            {a.name}
          </a>
          <span class="muted" style={{ fontSize: 12 }}>{fmtSize(a.size)}</span>
        </div>
        <audio src={url} controls preload="metadata" />
      </div>
    );
  }
  return (
    <div class="att-file">
      <div class="fi">
        <Icon name="file" />
      </div>
      <div class="grow" style={{ minWidth: 0 }}>
        <a href={url} class="ellipsis" style={{ display: 'block' }} onClick={(e) => { e.preventDefault(); openExternal(url); }}>
          {a.name}
        </a>
        <div class="muted" style={{ fontSize: 12 }}>{fmtSize(a.size)}</div>
      </div>
      <button class="ibtn" data-tip="Herunterladen" onClick={() => openExternal(url)}>
        <Icon name="download" />
      </button>
    </div>
  );
}

function VoiceMsg({ a }) {
  const ref = useRef();
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const bars = useRef(Array.from({ length: 40 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7 + a.size)) * 0.75)).current;
  const dur = a.duration || ref.current?.duration || 0;
  return (
    <div class="voice-msg">
      <audio
        ref={ref}
        src={fileUrl(a.url)}
        preload="metadata"
        onTimeUpdate={(e) => setPos(e.target.currentTime / (e.target.duration || dur || 1))}
        onEnded={() => { setPlaying(false); setPos(0); }}
      />
      <button class="play" onClick={() => { if (playing) ref.current.pause(); else ref.current.play(); setPlaying(!playing); }}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div class="wave" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const p = (e.clientX - r.left) / r.width; if (ref.current.duration) ref.current.currentTime = p * ref.current.duration; }}>
        {bars.map((h, i) => <span class={i / bars.length < pos ? 'p' : ''} style={{ height: h * 100 + '%' }} />)}
      </div>
      <span class="muted" style={{ fontSize: 12, minWidth: 34 }}>{fmtDuration(dur)}</span>
    </div>
  );
}

function Embed({ url }) {
  const e = getEmbed(url);
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(url);
  const [play, setPlay] = useState(false);
  if (yt) {
    return (
      <div class="embed" style={{ '--ec': '#ff0000', flexDirection: 'column', gap: 0, width: 460 }}>
        <div class="site">YouTube</div>
        {e?.title && <a class="et" onClick={() => openExternal(url)}>{e.title}</a>}
        {play ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <div class="embed-yt" onClick={() => setPlay(true)}>
            <img class="eimg" style={{ width: '100%' }} src={`https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`} />
          </div>
        )}
      </div>
    );
  }
  if (!e) return null;
  if (e.type === 'image') return <div class="att-img" onClick={() => openModal('lightbox', { type: 'image', url })}><img src={url} loading="lazy" /></div>;
  if (e.type === 'video') return <div class="att-img"><video src={url} controls preload="metadata" style={{ maxWidth: 480 }} /></div>;
  return (
    <div class="embed" style={{ '--ec': e.color || undefined, flexDirection: 'column', gap: 0 }}>
      <div class="site">{e.site}</div>
      {e.title && <a class="et" onClick={() => openExternal(url)}>{e.title}</a>}
      {e.description && <div class="ed">{e.description}</div>}
      {e.image && <img class="eimg" src={e.image} loading="lazy" onClick={() => openModal('lightbox', { type: 'image', url: e.image })} onError={(ev) => (ev.target.style.display = 'none')} />}
    </div>
  );
}

function Poll({ m }) {
  const p = m.poll;
  const total = Object.values(p.votes || {}).reduce((a, v) => a + v.length, 0);
  const voters = new Set(Object.values(p.votes || {}).flat()).size;
  const ended = p.endsAt <= Date.now();
  const left = Math.max(0, p.endsAt - Date.now());
  const leftStr = left > 864e5 ? Math.round(left / 864e5) + ' Tage' : left > 36e5 ? Math.round(left / 36e5) + ' Std.' : Math.round(left / 6e4) + ' Min.';
  const vote = (id) => !ended && !m.pending && rpc('votePoll', { channelId: m.channelId, messageId: m.id, optionId: id }).catch((e) => toast(e.message, 'error'));
  const max = Math.max(0, ...p.options.map((o) => (p.votes?.[o.id] || []).length));
  return (
    <div class="poll">
      <div class="q">{p.question}</div>
      <div class="sub">{p.multi ? 'Mehrere Antworten möglich' : 'Eine Antwort wählen'}</div>
      {p.options.map((o) => {
        const v = p.votes?.[o.id] || [];
        const mine = v.includes(S.me.id);
        const pct = total ? Math.round((v.length / total) * 100) : 0;
        return (
          <button class={`poll-opt ${mine ? 'voted' : ''}`} onClick={() => vote(o.id)} data-tip={v.length ? v.slice(0, 15).map((u) => displayName(u)).join(', ') : ''}>
            <div class="bar" style={{ width: (voters || ended ? pct : 0) + '%', background: ended && v.length === max && max ? 'color-mix(in srgb, var(--ok) 25%, transparent)' : undefined }} />
            {o.emoji && <EmojiView e={o.emoji} />}
            <span>{o.text}</span>
            {mine && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
            <span class="pct">{pct}% · {v.length}</span>
          </button>
        );
      })}
      <div class="row" style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
        <span>{voters} {voters === 1 ? 'Stimme' : 'Stimmen'} · {ended ? 'Umfrage beendet' : `noch ${leftStr}`}</span>
        {!ended && m.authorId === S.me.id && (
          <button class="btn link sm" style={{ marginLeft: 'auto' }} onClick={() => rpc('endPoll', { channelId: m.channelId, messageId: m.id })}>
            Jetzt beenden
          </button>
        )}
      </div>
    </div>
  );
}

function Reactions({ m, serverId }) {
  const entries = Object.entries(m.reactions || {});
  const [bursts, setBursts] = useState([]);
  useEffect(() => {
    if (m._burst && Date.now() - m._burst.at < 1500) {
      const id = Math.random();
      setBursts((b) => [...b, { id, emoji: m._burst.emoji }]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1300);
    }
  }, [m._burst?.at]);
  if (!entries.length) return null;
  const toggle = (emoji, burst) => {
    const mine = (m.reactions[emoji] || []).includes(S.me.id);
    rpc('react', { channelId: m.channelId, messageId: m.id, emoji, remove: mine && !burst, burst }).catch((e) => toast(e.message, 'error'));
  };
  return (
    <div class="reactions">
      {entries.map(([emoji, users]) => {
        const mine = users.includes(S.me.id);
        const names = users.slice(0, 12).map((u) => displayName(u, serverId)).join(', ') + (users.length > 12 ? ` und ${users.length - 12} weitere` : '');
        return (
          <button class={`reaction ${mine ? 'mine' : ''}`} data-tip={names + ' hat reagiert'} onClick={(e) => toggle(emoji, e.shiftKey)}>
            <EmojiView e={emoji} size={18} />
            {users.length}
            {bursts.filter((b) => b.emoji === emoji).map((b) =>
              [0, 1, 2, 3, 4, 5].map((i) => (
                <span class="burst" style={{ '--dx': Math.cos(i) * 40 + 'px', '--dy': -30 - Math.sin(i * 2) * 30 + 'px' }}>
                  <EmojiView e={emoji} />
                </span>
              ))
            )}
          </button>
        );
      })}
      <button class="reaction" data-tip="Reaktion hinzufügen" onClick={(e) => openPopout(e, 'emoji', { onPick: (em) => rpc('react', { channelId: m.channelId, messageId: m.id, emoji: em }) })}>
        <Icon name="smilePlus" size={16} />
      </button>
    </div>
  );
}

function SystemMessage({ m, serverId }) {
  const who = <b onClick={(e) => openPopout(e, 'profile', { uid: m.authorId, serverId })}>{displayName(m.authorId, serverId)}</b>;
  const target = m.targetId && S.users[m.targetId] ? <b>{displayName(m.targetId, serverId)}</b> : null;
  const texts = {
    join: <>{who} ist dem Server beigetreten. Willkommen! 👋</>,
    leave: <>{who} hat den Server verlassen.</>,
    pin: <>{who} hat eine <b onClick={() => jumpTo(m.channelId, m.targetMessage)}>Nachricht</b> angeheftet.</>,
    groupAdd: <>{who} hat {target} hinzugefügt.</>,
    groupRemove: <>{who} hat {target} entfernt.</>,
    groupLeave: <>{who} hat die Gruppe verlassen.</>,
    groupRename: m.name ? <>{who} hat die Gruppe in <b>{m.name}</b> umbenannt.</> : <>{who} hat den Gruppennamen entfernt.</>,
    groupIcon: <>{who} hat das Gruppenbild geändert.</>,
    groupOwner: <>{who} hat {target} zum Gruppenbesitzer gemacht. 👑</>,
    thread: <>{who} hat einen Thread gestartet: <b onClick={() => S.channels[m.targetId] && navigate(serverId, m.channelId, m.targetId)}>{S.channels[m.targetId]?.name || 'Thread'}</b></>,
  };
  const icon = { join: 'userPlus', leave: 'logout', pin: 'pin', thread: 'thread', groupAdd: 'userPlus', groupLeave: 'logout', groupRename: 'edit', groupIcon: 'edit', groupOwner: 'crown' }[m.kind] || 'users';
  return (
    <div class="sysmsg" data-mid={m.id}>
      <Icon name={icon} />
      <span>{texts[m.kind] || 'Systemnachricht'}</span>
      <span class="t">{fmtDateTime(m.createdAt)}</span>
    </div>
  );
}

// ---------- Kontextmenü ----------
export function messageMenu(e, m, ch) {
  const serverId = serverIdOf(ch);
  const own = m.authorId === S.me.id;
  const canManage = serverId ? can(serverId, P.MANAGE_MESSAGES) : ch.type !== 'dm' && ch.type !== 'group' ? false : false;
  const canPin = serverId ? can(serverId, P.MANAGE_MESSAGES) : true;
  openMenu(e, [
    { label: 'Reaktion hinzufügen', icon: 'smilePlus', onClick: () => openPopout({ stopPropagation() {}, currentTarget: e.target }, 'emoji', { onPick: (em) => rpc('react', { channelId: m.channelId, messageId: m.id, emoji: em }) }) },
    { label: 'Antworten', icon: 'reply', onClick: () => startReply(m) },
    { label: 'Weiterleiten', icon: 'forwardIc', onClick: () => openModal('forward', { message: m }) },
    serverId && ch.type !== 'thread' && can(serverId, P.CREATE_THREADS) && { label: m.threadId ? 'Thread öffnen' : 'Thread erstellen', icon: 'thread', onClick: () => openThreadFor(m, ch) },
    own && m.content && { label: 'Bearbeiten', icon: 'edit', onClick: () => startEdit(m) },
    canPin && { label: m.pinned ? 'Nicht mehr anheften' : 'Anheften', icon: 'pin', onClick: () => act('pin', { channelId: m.channelId, messageId: m.id, pinned: !m.pinned }) },
    '-',
    m.content && { label: 'Text kopieren', icon: 'copy', onClick: () => copy(m.content) },
    { label: 'Als ungelesen markieren', icon: 'bell', onClick: () => rpc('markUnread', { channelId: m.channelId, messageId: m.id }) },
    { label: 'Nachrichten-ID kopieren', icon: 'copy', onClick: () => copy(m.id) },
    m.authorId !== S.me.id && { label: 'Nachricht schreiben', icon: 'chat', onClick: () => openDM(m.authorId) },
    extractUrls(m.content).length && !m.embedsHidden && (own || canManage) && { label: 'Vorschau entfernen', icon: 'x', onClick: () => rpc('suppressEmbeds', { channelId: m.channelId, messageId: m.id }) },
    '-',
    (own || canManage) && {
      label: 'Nachricht löschen',
      danger: true,
      icon: 'trash',
      onClick: async () => {
        if (e.shiftKey || (await confirmDialog('Nachricht löschen', 'Willst du diese Nachricht wirklich löschen?', { ok: 'Löschen' }))) act('deleteMessage', { channelId: m.channelId, messageId: m.id });
      },
    },
  ]);
}

export function startReply(m) {
  S.replyTo[m.channelId] = { id: m.id, authorId: m.authorId, ping: true };
  update();
  document.querySelector('.composer textarea')?.focus();
}
export function startEdit(m) {
  S.editing = { id: m.id, channelId: m.channelId, text: m.content };
  update();
}

export async function openThreadFor(m, ch) {
  if (m.threadId && S.channels[m.threadId]) {
    navigate(serverIdOf(ch), ch.id, m.threadId);
    return;
  }
  const name = await promptDialog('Thread erstellen', { label: 'Thread-Name', value: (m.content || 'Thread').replace(/<[^>]+>/g, '').slice(0, 40), ok: 'Erstellen' });
  if (!name) return;
  const th = await act('createThread', { channelId: ch.id, messageId: m.id, name });
  S.channels[th.id] = th;
  navigate(serverIdOf(ch), ch.id, th.id);
}

// ---------- Bearbeiten ----------
function EditBox({ m }) {
  const [text, setText] = useState(S.editing.text);
  const ref = useRef();
  useEffect(() => {
    const t = ref.current;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
    t.style.height = t.scrollHeight + 'px';
  }, []);
  const save = async () => {
    if (text.trim() === m.content) return cancel();
    if (!text.trim() && !m.attachments?.length) {
      cancel();
      if (await confirmDialog('Nachricht löschen', 'Leere Nachricht – stattdessen löschen?', { ok: 'Löschen' })) act('deleteMessage', { channelId: m.channelId, messageId: m.id });
      return;
    }
    act('editMessage', { channelId: m.channelId, messageId: m.id, content: text });
    cancel();
  };
  const cancel = () => {
    S.editing = null;
    update();
  };
  return (
    <div style={{ minWidth: 340, width: '100%' }}>
      <textarea
        ref={ref}
        class="textarea"
        style={{ minHeight: 44, borderRadius: 14 }}
        value={text}
        onInput={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = e.target.scrollHeight + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div class="hint" style={{ fontSize: 12, marginTop: 4 }}>
        Escape zum <a onClick={cancel} style={{ cursor: 'pointer' }}>Abbrechen</a> · Enter zum <a onClick={save} style={{ cursor: 'pointer' }}>Speichern</a>
      </div>
    </div>
  );
}

// ---------- Einzelne Nachricht ----------
export function Message({ m, ch, first, serverId, flash }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  if (m.type === 'system') return <SystemMessage m={m} serverId={serverId} />;
  const editing = S.editing?.id === m.id;
  const emojiOnly = !m.attachments?.length && !m.poll && isEmojiOnly(m.content);
  const urls = prefs.showEmbeds && !m.embedsHidden ? extractUrls(m.content) : [];
  const onlyImageUrl = urls.length === 1 && m.content.trim() === urls[0] && /\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(urls[0]);
  const reply = m.replyTo && S.messages[m.channelId]?.list.find((x) => x.id === m.replyTo);
  const mentioned = m.authorId !== S.me.id && ch.type !== 'dm' && ch.type !== 'group' && mentionsMe(m, ch);
  const quick = prefs.recentEmojis.slice(0, 3);
  const react = (emoji) => {
    pushRecent(emoji);
    rpc('react', { channelId: m.channelId, messageId: m.id, emoji }).catch((e) => toast(e.message, 'error'));
  };
  const lightbox = (x) => openModal('lightbox', x);

  return (
    <div class={`msg ${flash ? 'flash' : ''}`} data-mid={m.id} onContextMenu={(e) => !m.pending && messageMenu(e, m, ch)}>
      {reply !== undefined && m.replyTo && (
        <div class="reply-ref" onClick={() => jumpTo(m.channelId, m.replyTo)}>
          <Icon name="reply" />
          {reply ? (
            <>
              <Avatar uid={reply.authorId} size={16} serverId={serverId} deco={false} />
              <span class="rn" style={{ color: roleColor(reply.authorId, serverId) || undefined }}>{displayName(reply.authorId, serverId)}</span>
              <span class="ellipsis" style={{ minWidth: 0 }}>{reply.content ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.content.slice(0, 200), { serverId, inline: true }) }} /> : 'Anhang'}</span>
            </>
          ) : (
            <span class="ellipsis" style={{ fontStyle: 'italic' }}>Ursprüngliche Nachricht wurde gelöscht oder ist nicht geladen</span>
          )}
        </div>
      )}
      {m.replyTo && reply === undefined && (
        <div class="reply-ref" onClick={() => jumpTo(m.channelId, m.replyTo)}>
          <Icon name="reply" /> <span style={{ fontStyle: 'italic' }}>Antwort auf eine ältere Nachricht – klicken zum Springen</span>
        </div>
      )}
      <div class={`bubble ${emojiOnly ? 'emoji-only' : ''} ${mentioned ? 'mention-me' : ''} ${m.pending ? 'pending' : ''} ${m.failed ? 'failed' : ''}`}>
        {m.forward && (
          <div class="forward">
            <div class="fh">↪ Weitergeleitet von {displayName(m.forward.authorId)}</div>
            {m.forward.content && <Md text={m.forward.content} serverId={serverId} />}
            {!!m.forward.attachments?.length && <div class="atts">{m.forward.attachments.map((a) => <Attachment a={a} onOpen={lightbox} />)}</div>}
          </div>
        )}
        {editing ? (
          <EditBox m={m} />
        ) : (
          m.content && !onlyImageUrl && (
            <div class="row" style={{ alignItems: 'flex-end', gap: 0, display: 'block' }}>
              <Md text={m.content} serverId={serverId} />
              {m.editedAt && <span class="edited" data-tip={fmtDateTime(m.editedAt)}>(bearbeitet)</span>}
            </div>
          )
        )}
        {m.poll && <Poll m={m} />}
        {!!m.attachments?.length && (
          <div class="atts">
            {m.attachments.map((a) => (
              <Attachment a={a} onOpen={lightbox} />
            ))}
          </div>
        )}
        {urls.map((u) => (
          <Embed url={u} key={u} />
        ))}
        {m.failed && <div class="err" style={{ marginTop: 4 }}>Senden fehlgeschlagen: {m.error}</div>}
        {!first && <span class="mtime">{fmtTime(m.createdAt)}</span>}
      </div>
      {m.thread && (
        <div class="thread-chip" onClick={() => navigate(serverId, m.channelId, m.thread.id)}>
          <Icon name="thread" size={16} />
          <b>{m.thread.name}</b>
          <span class="muted">{m.thread.count} {m.thread.count === 1 ? 'Nachricht' : 'Nachrichten'} ›</span>
        </div>
      )}
      <Reactions m={m} serverId={serverId} />
      {!m.pending && !editing && (
        <div class={`msg-tools ${toolsOpen ? 'open' : ''}`}>
          {quick.map((q) => (
            <button class="q" onClick={() => react(q)}>
              <EmojiView e={q} size={20} />
            </button>
          ))}
          <button class="ibtn sm" data-tip="Reagieren" onClick={(e) => openPopout(e, 'emoji', { onPick: react })}>
            <Icon name="smilePlus" />
          </button>
          <button class="ibtn sm" data-tip="Antworten" onClick={() => startReply(m)}>
            <Icon name="reply" />
          </button>
          {serverId && ch.type !== 'thread' && (
            <button class="ibtn sm" data-tip="Thread" onClick={() => openThreadFor(m, ch)}>
              <Icon name="thread" />
            </button>
          )}
          {m.authorId === S.me.id && m.content && (
            <button class="ibtn sm" data-tip="Bearbeiten" onClick={() => startEdit(m)}>
              <Icon name="edit" />
            </button>
          )}
          <button class="ibtn sm" data-tip="Mehr" onClick={(e) => messageMenu(e, m, ch)}>
            <Icon name="more" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Nachrichtengruppe ----------
export function MessageGroup({ msgs, ch, serverId }) {
  const first = msgs[0];
  const uid = first.authorId;
  const own = uid === S.me.id;
  const color = serverId ? roleColor(uid, serverId) : '';
  const isOwner = serverId && S.servers[serverId]?.ownerId === uid;
  const focusId = S.focusMsg && Date.now() - S.focusMsg.at < 3000 ? S.focusMsg.id : null;
  return (
    <div class={`mgroup ${own ? 'own' : ''}`}>
      {!own || document.body.classList.contains('compact') ? (
        <div class="gav" onClick={(e) => openPopout(e, 'profile', { uid, serverId })}>
          <Avatar uid={uid} size={38} serverId={serverId} />
        </div>
      ) : null}
      <div class="gbody">
        <div class="ghead">
          {!own && <span onClick={(e) => openPopout(e, 'profile', { uid, serverId })}><Name uid={uid} serverId={serverId} color={color} /></span>}
          {isOwner && <Icon name="crown" class="owner-crown" />}
          <span class="time" data-tip={new Date(first.createdAt).toLocaleString('de-DE')}>{fmtDateTime(first.createdAt)}</span>
        </div>
        {msgs.map((m, i) => (
          <Message key={m.id} m={m} ch={ch} first={i === 0} serverId={serverId} flash={focusId === m.id} />
        ))}
      </div>
    </div>
  );
}
