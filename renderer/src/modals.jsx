import { useState, useEffect, useRef } from 'preact/hooks';
import { S, update, prefs, setPref, closeModal, openModal, toast, confirmDialog } from './store';
import { act, rpc, upload, pickAndUpload, pickAvatar, fileUrl, navigate, copy, displayName, channelTitle, serverIdOf, sortedChannels, dmList, can, P, sendMessage, openExternal, isUnread, openDM } from './api';
import { Modal, Avatar, ServerIcon, ChannelIcon, GroupIcon, Seg, SegBox, Switch, ToggleRow } from './ui';
import { Icon } from './icons';
import { ProfileModal, CustomStatusModal, ActivityModal } from './profile';
import { ScreenShareModal } from './voiceui';
import { EmojiView } from './picker';

function ConfirmModal({ title, text, danger, ok, resolve }) {
  const done = (v) => {
    closeModal();
    resolve(v);
  };
  return (
    <Modal title={title} onClose={() => done(false)} footer={<><button class="btn ghost" onClick={() => done(false)}>Abbrechen</button><button class={`btn ${danger ? 'danger' : ''}`} onClick={() => done(true)} autoFocus>{ok}</button></>}>
      <div style={{ color: 'var(--text2)', lineHeight: 1.5 }}>{text}</div>
    </Modal>
  );
}

function PromptModal({ title, label, value, placeholder, ok, resolve, multiline }) {
  const [v, setV] = useState(value || '');
  const done = (x) => {
    closeModal();
    resolve(x);
  };
  return (
    <Modal title={title} onClose={() => done(null)} footer={<><button class="btn ghost" onClick={() => done(null)}>Abbrechen</button><button class="btn" onClick={() => done(v)}>{ok}</button></>}>
      <div class="field">
        {label && <label>{label}</label>}
        {multiline ? (
          <textarea class="textarea" value={v} placeholder={placeholder} onInput={(e) => setV(e.target.value)} autoFocus />
        ) : (
          <input class="input" value={v} placeholder={placeholder} onInput={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && done(v)} autoFocus />
        )}
      </div>
    </Modal>
  );
}

function CreateServerModal() {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState(`${S.me.displayName}s Server`);
  const [icon, setIcon] = useState('');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = code.trim().replace(/^.*\//, '');
    if (c.length < 5) return setPreview(null);
    const t = setTimeout(() => fetch(S.serverUrl + '/api/invite/' + encodeURIComponent(c)).then((r) => (r.ok ? r.json() : null)).then(setPreview).catch(() => setPreview(null)), 300);
    return () => clearTimeout(t);
  }, [code]);
  const create = async () => {
    setBusy(true);
    try {
      const r = await act('createServer', { name, icon });
      closeModal();
      setTimeout(() => navigate(r.id), 50);
    } catch {}
    setBusy(false);
  };
  const join = async () => {
    setBusy(true);
    try {
      const r = await act('joinInvite', { code });
      closeModal();
      setTimeout(() => navigate(r.id), 50);
    } catch {}
    setBusy(false);
  };
  return (
    <Modal title={tab === 'create' ? 'Eigenen Server erstellen' : 'Server beitreten'} sub={tab === 'create' ? 'Dein Ort für dich und deine Freunde. Du kannst alles später ändern.' : 'Gib einen Einladungscode ein, den du bekommen hast.'}>
      <SegBox style={{ marginBottom: 18 }}>
        <button class={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Erstellen</button>
        <button class={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>Beitreten</button>
      </SegBox>
      {tab === 'create' ? (
        <>
          <div class="row" style={{ justifyContent: 'center', marginBottom: 18 }}>
            <button
              onClick={async () => { const r = await pickAndUpload('image/*'); if (r) setIcon(r.url); }}
              style={{ width: 84, height: 84, borderRadius: 26, border: '2px dashed var(--line2)', display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'var(--bg2)' }}
            >
              {icon ? <img src={fileUrl(icon)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div class="col" style={{ alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--muted)' }}><Icon name="upload" />Icon</div>}
            </button>
          </div>
          <div class="field">
            <label>Servername</label>
            <input class="input" value={name} onInput={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          </div>
          <div class="row" style={{ justifyContent: 'flex-end' }}>
            <button class="btn" onClick={create} disabled={busy || !name.trim()}>Erstellen</button>
          </div>
        </>
      ) : (
        <>
          <div class="field">
            <label>Einladungscode</label>
            <input class="input" value={code} onInput={(e) => setCode(e.target.value)} placeholder="z. B. hX3k9Qa" autoFocus onKeyDown={(e) => e.key === 'Enter' && join()} />
          </div>
          {preview && (
            <div class="list-row">
              <ServerIcon server={preview.server} size={44} />
              <div class="grow">
                <b>{preview.server.name}</b>
                <div class="muted" style={{ fontSize: 13 }}>{preview.server.members} Mitglieder</div>
              </div>
            </div>
          )}
          <div class="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button class="btn" onClick={join} disabled={busy || !code.trim()}>Beitreten</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function InviteModal({ serverId }) {
  const s = S.servers[serverId];
  const [inv, setInv] = useState(null);
  const [expires, setExpires] = useState(0);
  const [maxUses, setMaxUses] = useState(0);
  const [q, setQ] = useState('');
  const [sent, setSent] = useState({});
  const gen = () => act('createInvite', { serverId, expiresIn: expires, maxUses }).then(setInv).catch(() => {});
  useEffect(() => {
    gen();
  }, [expires, maxUses]);
  const friends = Object.entries(S.rel).filter(([, t]) => t === 'friend').map(([id]) => id).filter((id) => !s.members[id]).filter((id) => !q || displayName(id).toLowerCase().includes(q.toLowerCase()));
  const sendTo = async (uid) => {
    const ch = await act('openDM', { userId: uid });
    S.channels[ch.id] = { ...(S.channels[ch.id] || {}), ...ch };
    await rpc('sendMessage', { channelId: ch.id, content: `Komm auf meinen Server **${s.name}**! Einladungscode: \`${inv.code}\`\n(Plus-Button oben → „Beitreten" → Code einfügen)` });
    setSent({ ...sent, [uid]: true });
  };
  return (
    <Modal title={`Freunde zu ${s.name} einladen`}>
      {friends.length > 0 && (
        <>
          <input class="input" placeholder="Freunde suchen" value={q} onInput={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 14 }}>
            {friends.map((id) => (
              <div class="row" style={{ padding: '6px 4px' }}>
                <Avatar uid={id} size={32} status />
                <span class="grow">{displayName(id)}</span>
                <button class="btn sm" disabled={!inv || sent[id]} onClick={() => sendTo(id)}>{sent[id] ? 'Gesendet' : 'Einladen'}</button>
              </div>
            ))}
          </div>
        </>
      )}
      <div class="label" style={{ marginBottom: 6 }}>Oder schick ihnen den Code</div>
      <div class="row" style={{ background: 'var(--bg2)', borderRadius: 12, padding: 6, paddingLeft: 14, border: '1px solid var(--line2)' }}>
        <code class="grow" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.05em' }}>{inv?.code || '…'}</code>
        <button class="btn sm" onClick={() => copy(inv.code, 'Code kopiert')} disabled={!inv}>Kopieren</button>
      </div>
      <div class="hint" style={{ marginTop: 8 }}>
        Deine Freunde brauchen außerdem die Server-Adresse <b style={{ color: 'var(--text)' }}>{S.serverUrl}</b> zum Einloggen.{' '}
        <a style={{ cursor: 'pointer' }} onClick={() => copy(`Lad dir Nook runter und melde dich an mit der Server-Adresse ${S.serverUrl}\nDann: Plus-Button oben → „Beitreten" → Code: ${inv?.code}`, 'Komplette Einladung kopiert')}>Komplette Einladung kopieren</a>
      </div>
      <div class="row" style={{ marginTop: 14 }}>
        <div class="field grow" style={{ margin: 0 }}>
          <label>Läuft ab nach</label>
          <select class="select" value={expires} onChange={(e) => setExpires(+e.target.value)}>
            <option value={0}>Nie</option>
            <option value={1800}>30 Minuten</option>
            <option value={3600}>1 Stunde</option>
            <option value={86400}>1 Tag</option>
            <option value={604800}>7 Tage</option>
          </select>
        </div>
        <div class="field grow" style={{ margin: 0 }}>
          <label>Max. Nutzungen</label>
          <select class="select" value={maxUses} onChange={(e) => setMaxUses(+e.target.value)}>
            <option value={0}>Unbegrenzt</option>
            {[1, 5, 10, 25, 50, 100].map((n) => <option value={n}>{n}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

const CHANNEL_TYPES = [
  ['text', 'hash', 'Text', 'Nachrichten, Bilder, GIFs, Emojis'],
  ['voice', 'speaker', 'Sprache', 'Reden, Video, Bildschirm teilen'],
  ['announce', 'megaphone', 'Ankündigungen', 'Nur Mods schreiben, alle lesen'],
  ['forum', 'forum', 'Forum', 'Beiträge mit eigenen Threads'],
  ['stage', 'stage', 'Bühne', 'Sprecher & Publikum für Events'],
];

function CreateChannelModal({ serverId, categoryId = null }) {
  const s = S.servers[serverId];
  const [type, setType] = useState('text');
  const [name, setName] = useState('');
  const [cat, setCat] = useState(categoryId);
  const [priv, setPriv] = useState(false);
  const [roles, setRoles] = useState([]);
  const create = async () => {
    const ch = await act('createChannel', { serverId, name, type, categoryId: cat, private: priv, allowedRoles: roles });
    S.channels[ch.id] = ch;
    closeModal();
    navigate(serverId, ch.id);
  };
  return (
    <Modal title="Kanal erstellen" footer={<><button class="btn ghost" onClick={closeModal}>Abbrechen</button><button class="btn" onClick={create}>Erstellen</button></>}>
      <div class="field">
        <label>Kanaltyp</label>
        {CHANNEL_TYPES.map(([t, ic, label, d]) => (
          <button class={`list-row ${type === t ? 'on' : ''}`} style={{ width: '100%', textAlign: 'left', borderColor: type === t ? 'var(--accent)' : undefined, background: type === t ? 'var(--accent-soft)' : undefined }} onClick={() => setType(t)}>
            <Icon name={ic} size={22} />
            <div class="grow">
              <b>{label}</b>
              <div class="muted" style={{ fontSize: 12.5 }}>{d}</div>
            </div>
          </button>
        ))}
      </div>
      <div class="field">
        <label>Name</label>
        <input class="input" value={name} onInput={(e) => setName(e.target.value)} placeholder={type === 'voice' ? 'Lounge' : 'neuer-kanal'} autoFocus onKeyDown={(e) => e.key === 'Enter' && create()} />
      </div>
      <div class="field">
        <label>Kategorie</label>
        <select class="select" value={cat || ''} onChange={(e) => setCat(e.target.value || null)}>
          <option value="">Keine</option>
          {s.categories.map((c) => <option value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <ToggleRow title="Privater Kanal" desc="Nur ausgewählte Rollen können ihn sehen" on={priv} onChange={setPriv} />
      {priv && (
        <div style={{ paddingTop: 10 }}>
          {s.roles.filter((r) => r.id !== serverId).map((r) => (
            <label class="row" style={{ padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={roles.includes(r.id)} onChange={(e) => setRoles(e.target.checked ? [...roles, r.id] : roles.filter((x) => x !== r.id))} />
              <span class="role-dot" style={{ background: r.color || 'var(--muted)' }} /> {r.name}
            </label>
          ))}
          {s.roles.length <= 1 && <div class="hint">Erstelle zuerst Rollen in den Server-Einstellungen.</div>}
        </div>
      )}
    </Modal>
  );
}

function ChannelSettingsModal({ channelId }) {
  const ch = S.channels[channelId];
  const s = S.servers[ch?.serverId];
  const [name, setName] = useState(ch?.name || '');
  const [topic, setTopic] = useState(ch?.topic || '');
  const [slowmode, setSlowmode] = useState(ch?.slowmode || 0);
  const [limit, setLimit] = useState(ch?.userLimit || 0);
  const [priv, setPriv] = useState(!!ch?.private);
  const [roles, setRoles] = useState(ch?.allowedRoles || []);
  const [nsfw, setNsfw] = useState(!!ch?.nsfw);
  const [cat, setCat] = useState(ch?.categoryId || '');
  if (!ch) return null;
  const isVoice = ch.type === 'voice' || ch.type === 'stage';
  const save = async () => {
    await act('updateChannel', { channelId, name, topic, slowmode, userLimit: limit, private: priv, allowedRoles: roles, nsfw, categoryId: cat || null }, 'Gespeichert');
    closeModal();
  };
  return (
    <Modal
      title={`Kanal bearbeiten · ${ch.name}`}
      footer={
        <>
          <button class="btn link" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={async () => { closeModal(); if (await confirmDialog('Kanal löschen', `${ch.name} endgültig löschen?`, { ok: 'Löschen' })) act('deleteChannel', { channelId }); }}>
            Kanal löschen
          </button>
          <button class="btn ghost" onClick={closeModal}>Abbrechen</button>
          <button class="btn" onClick={save}>Speichern</button>
        </>
      }
    >
      <div class="field">
        <label>Name</label>
        <input class="input" value={name} onInput={(e) => setName(e.target.value)} />
      </div>
      {!isVoice && (
        <div class="field">
          <label>Thema</label>
          <textarea class="textarea" value={topic} onInput={(e) => setTopic(e.target.value)} placeholder="Worum geht's hier?" maxLength={1024} />
        </div>
      )}
      <div class="field">
        <label>Kategorie</label>
        <select class="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Keine</option>
          {s.categories.map((c) => <option value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {!isVoice && (
        <div class="field">
          <label>Slowmode</label>
          <select class="select" value={slowmode} onChange={(e) => setSlowmode(+e.target.value)}>
            {[[0, 'Aus'], [5, '5 Sekunden'], [10, '10 Sekunden'], [30, '30 Sekunden'], [60, '1 Minute'], [300, '5 Minuten'], [900, '15 Minuten'], [3600, '1 Stunde']].map(([v, l]) => <option value={v}>{l}</option>)}
          </select>
        </div>
      )}
      {isVoice && (
        <div class="field">
          <label>Nutzerlimit: {limit || 'unbegrenzt'}</label>
          <input type="range" min="0" max="99" value={limit} onInput={(e) => setLimit(+e.target.value)} />
        </div>
      )}
      {!isVoice && <ToggleRow title="Altersbeschränkt (NSFW)" desc="Zeigt vor dem Öffnen eine Warnung" on={nsfw} onChange={setNsfw} />}
      <ToggleRow title="Privater Kanal" desc="Nur ausgewählte Rollen (und Admins) sehen ihn" on={priv} onChange={setPriv} />
      {priv && (
        <div style={{ paddingTop: 10 }}>
          {s.roles.filter((r) => r.id !== s.id).map((r) => (
            <label class="row" style={{ padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={roles.includes(r.id)} onChange={(e) => setRoles(e.target.checked ? [...roles, r.id] : roles.filter((x) => x !== r.id))} />
              <span class="role-dot" style={{ background: r.color || 'var(--muted)' }} /> {r.name}
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

const GROUP_COLORS = ['#ff7a45', '#f5c542', '#2dd4a7', '#4cc3ff', '#60a5fa', '#c084fc', '#ff5c8a', '#a3e635'];
const GROUP_MAX = 25;

function ColorPick({ value, onChange }) {
  return (
    <div class="swatches sm">
      <button class={`swatch auto ${!value ? 'on' : ''}`} data-tip="Automatisch" onClick={() => onChange('')}>
        <Icon name="x" size={14} />
      </button>
      {GROUP_COLORS.map((c) => (
        <button class={`swatch ${value === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

function CreateGroupModal({ channelId }) {
  const existing = channelId && S.channels[channelId];
  const friends = Object.entries(S.rel).filter(([, t]) => t === 'friend').map(([id]) => id).filter((id) => !existing?.recipients.includes(id));
  const [sel, setSel] = useState([]);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const isDM = existing?.type === 'dm';
  const room = GROUP_MAX - (existing ? existing.recipients.length : 1);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : sel.length < room ? [...sel, id] : sel);
  const creating = isDM || (!existing && sel.length > 1);
  const go = async () => {
    if (isDM) {
      // Aus einer DM wird eine neue Gruppe mit allen
      const other = existing.recipients.find((r) => r !== S.me.id);
      const ch = await act('createGroup', { userIds: [other, ...sel], name, color });
      S.channels[ch.id] = ch;
      closeModal();
      navigate('@me', ch.id);
      return;
    }
    if (existing) {
      for (const id of sel) await act('groupAdd', { channelId, userId: id });
      closeModal();
      return;
    }
    if (sel.length === 1) {
      closeModal();
      return openDM(sel[0]);
    }
    const ch = await act('createGroup', { userIds: sel, name, color });
    S.channels[ch.id] = ch;
    closeModal();
    navigate('@me', ch.id);
  };
  const shown = friends
    .filter((id) => !q || displayName(id).toLowerCase().includes(q.toLowerCase()) || S.users[id]?.username.includes(q.toLowerCase()))
    .sort((a, b) => (S.users[b]?.status !== 'offline') - (S.users[a]?.status !== 'offline') || displayName(a).localeCompare(displayName(b)));
  return (
    <Modal
      title={isDM ? 'Freunde hinzufügen' : existing ? 'Zur Gruppe hinzufügen' : 'Gruppe erstellen'}
      sub={isDM ? `Dadurch entsteht eine neue Gruppe mit ${displayName(existing.recipients.find((r) => r !== S.me.id))}.` : `Wähle Freunde aus · noch ${room - sel.length} ${room - sel.length === 1 ? 'Platz' : 'Plätze'} frei`}
      footer={
        <button class="btn" disabled={!sel.length} onClick={go}>
          {isDM ? 'Gruppe erstellen' : existing ? `Hinzufügen${sel.length ? ` (${sel.length})` : ''}` : sel.length > 1 ? `Gruppe erstellen (${sel.length + 1})` : 'Chat starten'}
        </button>
      }
    >
      <div class="pick-box">
        {sel.map((id) => (
          <button class="pick-chip" onClick={() => toggle(id)} data-tip="Entfernen">
            <Avatar uid={id} size={20} deco={false} />
            {displayName(id)}
            <Icon name="x" size={13} />
          </button>
        ))}
        <input placeholder={sel.length ? 'Weitere suchen …' : 'Freunde suchen'} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !q && sel.length && setSel(sel.slice(0, -1))} autoFocus />
      </div>
      <div class="pick-list">
        {shown.map((id) => {
          const on = sel.includes(id);
          return (
            <button class={`pick-row ${on ? 'on' : ''}`} onClick={() => toggle(id)}>
              <Avatar uid={id} size={36} status />
              <span class="grow" style={{ minWidth: 0 }}>
                <b class="ellipsis" style={{ display: 'block' }}>{displayName(id)}</b>
                <span class="muted ellipsis" style={{ display: 'block', fontSize: 12.5 }}>@{S.users[id]?.username}</span>
              </span>
              <span class={`pick-check ${on ? 'on' : ''}`}>{on && <Icon name="check" size={14} />}</span>
            </button>
          );
        })}
        {!friends.length && <div class="hint">Du brauchst zuerst Freunde.</div>}
        {friends.length > 0 && !shown.length && <div class="hint">Niemand gefunden.</div>}
      </div>
      {creating && (
        <div class="pick-extra">
          <div class="field" style={{ margin: 0 }}>
            <label>Gruppenname (optional)</label>
            <input class="input" placeholder="z. B. Die Crew" value={name} maxLength={60} onInput={(e) => setName(e.target.value)} />
          </div>
          <div class="field" style={{ margin: '12px 0 0' }}>
            <label>Gruppenfarbe</label>
            <ColorPick value={color} onChange={setColor} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function GroupSettingsModal({ channelId }) {
  const ch = S.channels[channelId];
  const [name, setName] = useState(ch?.name || '');
  const [topic, setTopic] = useState(ch?.topic || '');
  const [color, setColor] = useState(ch?.color || '');
  const [q, setQ] = useState('');
  if (!ch) return null;
  const owner = ch.ownerId === S.me.id;
  const dirty = name !== (ch.name || '') || topic !== (ch.topic || '') || color !== (ch.color || '');
  const leave = async () => {
    if (!(await confirmDialog('Gruppe verlassen', `„${channelTitle(ch)}" wirklich verlassen?`, { ok: 'Verlassen' }))) return;
    await act('groupRemove', { channelId, userId: S.me.id });
    closeModal();
    navigate('@me', null);
  };
  const online = (id) => S.users[id] && S.users[id].status !== 'offline';
  const members = ch.recipients
    .filter((id) => !q || displayName(id).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b === ch.ownerId) - (a === ch.ownerId) || online(b) - online(a) || displayName(a).localeCompare(displayName(b)));
  const live = { ...ch, color };
  return (
    <Modal
      title="Gruppeneinstellungen"
      footer={
        <>
          <button class="btn link" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={leave}>
            Gruppe verlassen
          </button>
          <button class="btn ghost" onClick={closeModal}>
            Schließen
          </button>
          <button class="btn" disabled={!dirty} onClick={async () => { await act('updateGroup', { channelId, name, topic, color }, 'Gespeichert'); closeModal(); }}>
            Speichern
          </button>
        </>
      }
    >
      <div class="gset-hero" style={{ '--gc': color || 'var(--accent)' }}>
        <button class="gset-icon" onClick={async () => { const r = await pickAndUpload('image/*'); if (r) act('updateGroup', { channelId, icon: r.url }); }} data-tip="Gruppenbild ändern">
          <GroupIcon ch={live} size={76} />
          <span class="gset-edit">
            <Icon name="upload" size={20} />
          </span>
        </button>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="gset-name ellipsis">{name || channelTitle({ ...ch, name: '' })}</div>
          <div class="muted" style={{ fontSize: 13 }}>
            {ch.recipients.length} Mitglieder · erstellt am {new Date(ch.createdAt).toLocaleDateString('de-DE')}
          </div>
          {ch.icon && (
            <button class="btn link sm" style={{ padding: 0, marginTop: 4 }} onClick={() => act('updateGroup', { channelId, icon: '' })}>
              Bild entfernen
            </button>
          )}
        </div>
      </div>
      <div class="field">
        <label>Gruppenname</label>
        <input class="input" value={name} placeholder={channelTitle({ ...ch, name: '' })} onInput={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div class="field">
        <label>Beschreibung</label>
        <textarea class="textarea" style={{ minHeight: 60 }} value={topic} maxLength={200} placeholder="Worum geht's in dieser Gruppe?" onInput={(e) => setTopic(e.target.value)} />
      </div>
      <div class="field">
        <label>Gruppenfarbe</label>
        <ColorPick value={color} onChange={setColor} />
      </div>
      <div class="row" style={{ margin: '18px 0 8px' }}>
        <div class="label grow">Mitglieder — {ch.recipients.length}/{GROUP_MAX}</div>
        <button class="btn sm" disabled={ch.recipients.length >= GROUP_MAX} onClick={() => openModal('createGroup', { channelId })}>
          <Icon name="userPlus" /> Hinzufügen
        </button>
      </div>
      {ch.recipients.length > 6 && <input class="input" placeholder="Mitglieder suchen" value={q} onInput={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />}
      <div class="gset-members">
        {members.map((id) => (
          <div class="gset-member">
            <Avatar uid={id} size={36} status />
            <div class="grow" style={{ minWidth: 0 }}>
              <div class="row" style={{ gap: 6 }}>
                <b class="ellipsis">{displayName(id)}</b>
                {ch.ownerId === id && <Icon name="crown" size={14} style={{ color: 'var(--warn)', flex: 'none' }} />}
                {id === S.me.id && <span class="chip" style={{ padding: '1px 7px', fontSize: 11 }}>Du</span>}
              </div>
              <div class="muted ellipsis" style={{ fontSize: 12.5 }}>
                @{S.users[id]?.username} · {online(id) ? 'online' : 'offline'}
              </div>
            </div>
            {owner && id !== S.me.id && (
              <>
                <button class="ibtn sm" data-tip="Zum Besitzer machen" onClick={async () => (await confirmDialog('Besitz übertragen', `${displayName(id)} wird neuer Besitzer der Gruppe.`, { ok: 'Übertragen', danger: false })) && act('updateGroup', { channelId, ownerId: id }, 'Besitz übertragen')}>
                  <Icon name="crown" />
                </button>
                <button class="ibtn sm red" data-tip="Aus Gruppe entfernen" onClick={() => act('groupRemove', { channelId, userId: id })}>
                  <Icon name="x" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function PollModal({ channelId, question = '' }) {
  const [q, setQ] = useState(question);
  const [opts, setOpts] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState(24);
  const send = () => {
    const options = opts.map((t) => t.trim()).filter(Boolean).map((text) => ({ text }));
    if (!q.trim() || options.length < 2) return toast('Frage und mindestens 2 Antworten nötig', 'error');
    sendMessage(channelId, { content: '', poll: { question: q, options, multi, hours } });
    closeModal();
  };
  return (
    <Modal title="Umfrage erstellen" footer={<><button class="btn ghost" onClick={closeModal}>Abbrechen</button><button class="btn" onClick={send}>Posten</button></>}>
      <div class="field">
        <label>Frage</label>
        <input class="input" value={q} onInput={(e) => setQ(e.target.value)} maxLength={300} placeholder="Was zocken wir heute?" autoFocus />
      </div>
      <div class="field">
        <label>Antworten</label>
        {opts.map((o, i) => (
          <div class="row">
            <input class="input" value={o} maxLength={55} placeholder={`Antwort ${i + 1}`} onInput={(e) => { const n = [...opts]; n[i] = e.target.value; setOpts(n); }} />
            {opts.length > 2 && <button class="ibtn" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Icon name="trash" /></button>}
          </div>
        ))}
        {opts.length < 10 && <button class="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpts([...opts, ''])}><Icon name="plus" /> Antwort hinzufügen</button>}
      </div>
      <div class="field">
        <label>Dauer</label>
        <select class="select" value={hours} onChange={(e) => setHours(+e.target.value)}>
          {[[1, '1 Stunde'], [4, '4 Stunden'], [8, '8 Stunden'], [24, '24 Stunden'], [72, '3 Tage'], [168, '1 Woche'], [336, '2 Wochen']].map(([v, l]) => <option value={v}>{l}</option>)}
        </select>
      </div>
      <ToggleRow title="Mehrfachauswahl erlauben" on={multi} onChange={setMulti} />
    </Modal>
  );
}

function ForwardModal({ message }) {
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const targets = [
    ...dmList().map((c) => ({ ch: c, label: channelTitle(c), sub: c.type === 'dm' ? 'Direktnachricht' : 'Gruppe' })),
    ...Object.values(S.servers).flatMap((s) => sortedChannels(s.id).filter((c) => c.type === 'text' && can(s.id, P.SEND)).map((c) => ({ ch: c, label: '#' + c.name, sub: s.name }))),
  ].filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()) || t.sub.toLowerCase().includes(q.toLowerCase()));
  const send = async (t) => {
    await act('sendMessage', { channelId: t.ch.id, content: note, forwardOf: { channelId: message.channelId, messageId: message.id } });
    toast('Weitergeleitet', 'success');
    closeModal();
  };
  return (
    <Modal title="Weiterleiten an …">
      <input class="input" placeholder="Suchen" value={q} onInput={(e) => setQ(e.target.value)} autoFocus style={{ marginBottom: 8 }} />
      <input class="input" placeholder="Optionale Nachricht dazu" value={note} onInput={(e) => setNote(e.target.value)} style={{ marginBottom: 10 }} />
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {targets.slice(0, 60).map((t) => (
          <div class="row" style={{ padding: '7px 4px' }}>
            {t.ch.type === 'dm' ? <Avatar uid={t.ch.recipients.find((r) => r !== S.me.id)} size={30} /> : <ChannelIcon ch={t.ch} size={22} />}
            <div class="grow" style={{ minWidth: 0 }}>
              <div class="ellipsis" style={{ fontWeight: 700 }}>{t.label}</div>
              <div class="muted" style={{ fontSize: 12 }}>{t.sub}</div>
            </div>
            <button class="btn sm" onClick={() => send(t)}>Senden</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Lightbox({ url, type, name }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && closeModal();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="lightbox" onClick={closeModal}>
      {type === 'video' ? <video src={url} controls autoplay onClick={(e) => e.stopPropagation()} /> : <img src={url} onClick={(e) => e.stopPropagation()} />}
      <div class="lb-bar">
        <button class="btn ghost sm" onClick={(e) => { e.stopPropagation(); openExternal(url); }}><Icon name="download" /> Öffnen / Speichern</button>
        <button class="btn ghost sm" onClick={(e) => { e.stopPropagation(); copy(url, 'Link kopiert'); }}><Icon name="link" /></button>
        <button class="btn ghost sm" onClick={closeModal}><Icon name="x" /></button>
      </div>
    </div>
  );
}

function QuickSwitch() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const ql = q.toLowerCase().replace(/^[#@*]/, '');
  const items = [];
  for (const c of dmList()) items.push({ label: channelTitle(c), sub: c.type === 'dm' ? 'Direktnachricht' : 'Gruppe', go: () => navigate('@me', c.id), ch: c, unread: isUnread(c) });
  for (const id of Object.keys(S.rel).filter((id) => S.rel[id] === 'friend')) if (!items.some((i) => i.ch?.type === 'dm' && i.ch.recipients.includes(id))) items.push({ label: displayName(id), sub: 'Freund', go: () => openDM(id), uid: id });
  for (const s of Object.values(S.servers)) {
    items.push({ label: s.name, sub: 'Server', go: () => navigate(s.id), server: s });
    for (const c of sortedChannels(s.id)) items.push({ label: c.name, sub: s.name, go: () => navigate(s.id, c.id), ch: c, unread: isUnread(c) });
  }
  const list = items.filter((i) => !ql || i.label.toLowerCase().includes(ql)).sort((a, b) => (b.unread ? 1 : 0) - (a.unread ? 1 : 0)).slice(0, 12);
  const run = (i) => {
    closeModal();
    i?.go();
  };
  return (
    <Modal title="Wohin soll's gehen?">
      <input
        class="input"
        style={{ height: 48, fontSize: 17 }}
        placeholder="Kanal, Server, Freund oder DM suchen"
        value={q}
        autoFocus
        onInput={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((sel + 1) % list.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((sel - 1 + list.length) % list.length); }
          if (e.key === 'Enter') run(list[sel]);
        }}
      />
      <div style={{ marginTop: 10, maxHeight: 400, overflowY: 'auto' }}>
        {list.map((i, idx) => (
          <div class={`qs-item ${idx === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(idx)} onClick={() => run(i)}>
            {i.server ? <ServerIcon server={i.server} size={26} /> : i.uid ? <Avatar uid={i.uid} size={26} status /> : i.ch?.type === 'dm' ? <Avatar uid={i.ch.recipients.find((r) => r !== S.me.id)} size={26} status /> : <ChannelIcon ch={i.ch} size={20} />}
            <b class={i.unread ? '' : ''} style={{ fontWeight: i.unread ? 800 : 600 }}>{i.label}</b>
            <span class="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{i.sub}</span>
          </div>
        ))}
      </div>
      <div class="hint" style={{ marginTop: 8 }}>Tipp: <span class="kbd">Strg</span> + <span class="kbd">K</span> öffnet das hier überall.</div>
    </Modal>
  );
}

function NotifModal({ serverId, channelId }) {
  const key = channelId || serverId;
  const [level, setLevel] = useState(prefs.notif[key] || (channelId ? 'default' : 'mentions'));
  const save = (v) => {
    setLevel(v);
    if (v === 'default') delete prefs.notif[key];
    else prefs.notif[key] = v;
    setPref('notif', prefs.notif);
  };
  return (
    <Modal title={channelId ? `Benachrichtigungen · #${S.channels[channelId]?.name}` : `Benachrichtigungen · ${S.servers[serverId]?.name}`}>
      {[
        channelId && ['default', 'Wie der Server', 'Übernimmt die Server-Einstellung'],
        ['all', 'Alle Nachrichten', 'Bei jeder Nachricht benachrichtigen'],
        ['mentions', 'Nur @Erwähnungen', 'Nur wenn du, deine Rolle oder @everyone erwähnt wird'],
        ['none', 'Nichts', 'Keine Benachrichtigungen'],
      ].filter(Boolean).map(([v, t, d]) => (
        <button class="list-row" style={{ width: '100%', textAlign: 'left', borderColor: level === v ? 'var(--accent)' : undefined }} onClick={() => save(v)}>
          <div class="grow">
            <b>{t}</b>
            <div class="muted" style={{ fontSize: 12.5 }}>{d}</div>
          </div>
          {level === v && <Icon name="check" style={{ color: 'var(--accent)' }} />}
        </button>
      ))}
    </Modal>
  );
}

function ServerProfileModal({ serverId }) {
  const s = S.servers[serverId];
  const m = s.members[S.me.id];
  const [nick, setNick] = useState(m.nick || '');
  const [avatar, setAvatar] = useState(m.avatar || '');
  const [banner, setBanner] = useState(m.banner || '');
  const [bio, setBio] = useState(m.bio || '');
  const save = async () => {
    await act('setServerProfile', { serverId, nick, avatar, banner, bio }, 'Server-Profil gespeichert');
    closeModal();
  };
  return (
    <Modal title={`Dein Profil auf ${s.name}`} sub="Nur auf diesem Server sichtbar – Nickname, Avatar, Banner und Bio." footer={<><button class="btn ghost" onClick={closeModal}>Abbrechen</button><button class="btn" onClick={save}>Speichern</button></>}>
      <div class="field">
        <label>Nickname</label>
        <input class="input" value={nick} onInput={(e) => setNick(e.target.value)} placeholder={S.me.displayName} maxLength={32} />
      </div>
      <div class="field">
        <label>Server-Avatar</label>
        <div class="row">
          <Avatar uid={S.me.id} size={56} src={fileUrl(avatar || S.me.avatar)} />
          <button class="btn ghost sm" onClick={async () => { const r = await pickAvatar(); if (r) setAvatar(r.url); }}>Hochladen</button>
          {avatar && <button class="btn link sm" onClick={() => setAvatar('')}>Entfernen</button>}
        </div>
      </div>
      <div class="field">
        <label>Server-Banner</label>
        <div class="row">
          <div style={{ width: 140, height: 50, borderRadius: 10, background: banner ? `url(${fileUrl(banner)}) center/cover` : 'var(--panel3)' }} />
          <button class="btn ghost sm" onClick={async () => { const r = await pickAndUpload('image/*'); if (r) setBanner(r.url); }}>Hochladen</button>
          {banner && <button class="btn link sm" onClick={() => setBanner('')}>Entfernen</button>}
        </div>
      </div>
      <div class="field">
        <label>Server-Bio</label>
        <textarea class="textarea" value={bio} onInput={(e) => setBio(e.target.value)} maxLength={400} placeholder="Leer = deine normale Bio" />
      </div>
    </Modal>
  );
}

function BanModal({ serverId, userId }) {
  const [reason, setReason] = useState('');
  const [del, setDel] = useState(false);
  return (
    <Modal title={`${displayName(userId, serverId)} bannen`} footer={<><button class="btn ghost" onClick={closeModal}>Abbrechen</button><button class="btn danger" onClick={async () => { await act('ban', { serverId, userId, reason, deleteMessages: del }, 'Gebannt'); closeModal(); }}>Bannen</button></>}>
      <div class="field">
        <label>Grund (optional)</label>
        <input class="input" value={reason} onInput={(e) => setReason(e.target.value)} />
      </div>
      <ToggleRow title="Alle Nachrichten der Person löschen" on={del} onChange={setDel} />
    </Modal>
  );
}

function NsfwGate({ channelId }) {
  return (
    <Modal title="Altersbeschränkter Kanal" footer={<><button class="btn ghost" onClick={() => { closeModal(); navigate(S.view.serverId); }}>Zurück</button><button class="btn" onClick={() => { prefs.nsfwOk = { ...(prefs.nsfwOk || {}), [channelId]: true }; setPref('nsfwOk', prefs.nsfwOk); closeModal(); }}>Weiter</button></>}>
      Dieser Kanal kann Inhalte enthalten, die nicht für alle geeignet sind. Willst du fortfahren?
    </Modal>
  );
}

const MODALS = {
  confirm: ConfirmModal,
  prompt: PromptModal,
  createServer: CreateServerModal,
  invite: InviteModal,
  createChannel: CreateChannelModal,
  channelSettings: ChannelSettingsModal,
  createGroup: CreateGroupModal,
  groupSettings: GroupSettingsModal,
  poll: PollModal,
  forward: ForwardModal,
  lightbox: Lightbox,
  quickSwitch: QuickSwitch,
  notif: NotifModal,
  serverProfile: ServerProfileModal,
  ban: BanModal,
  profile: ProfileModal,
  customStatus: CustomStatusModal,
  activity: ActivityModal,
  screenshare: ScreenShareModal,
  nsfw: NsfwGate,
};

export function ModalHost() {
  return (
    <>
      {S.modals.map((m) => {
        const C = MODALS[m.type];
        return C ? <C key={m.key} {...m.props} /> : null;
      })}
    </>
  );
}
