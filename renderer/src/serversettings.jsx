import { useState, useEffect } from 'preact/hooks';
import { S, update, confirmDialog, promptDialog, openModal, toast } from './store';
import { act, rpc, upload, pickAndUpload, pickFile, fileUrl, displayName, can, P, sortedChannels, emojiUrl, copy } from './api';
import { LABELS } from '../../shared/perms';
import { Avatar, ServerIcon, Switch, ToggleRow, Spinner } from './ui';
import { Icon } from './icons';
import { memberMenu } from './sidebar';
import { ACCENTS } from './settings';

function Overview({ s }) {
  const [name, setName] = useState(s.name);
  const [desc, setDesc] = useState(s.description || '');
  const [sys, setSys] = useState(s.systemChannelId === undefined ? '' : s.systemChannelId === null ? 'none' : s.systemChannelId);
  const editable = can(s.id, P.MANAGE_SERVER);
  const save = () => act('updateServer', { serverId: s.id, name, description: desc, systemChannelId: sys === 'none' ? null : sys || undefined }, 'Gespeichert');
  return (
    <>
      <h1>Server-Übersicht</h1>
      <div class="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div class="col" style={{ alignItems: 'center' }}>
          <ServerIcon server={s} size={100} />
          {editable && (
            <div class="row">
              <button class="btn sm" onClick={async () => { const r = await pickAndUpload('image/*'); if (r) act('updateServer', { serverId: s.id, icon: r.url }); }}>Icon ändern</button>
              {s.icon && <button class="btn link sm" onClick={() => act('updateServer', { serverId: s.id, icon: '' })}>Entfernen</button>}
            </div>
          )}
        </div>
        <div class="grow">
          <div class="field">
            <label>Servername</label>
            <input class="input" value={name} disabled={!editable} onInput={(e) => setName(e.target.value)} />
          </div>
          <div class="field">
            <label>Beschreibung</label>
            <textarea class="textarea" value={desc} disabled={!editable} onInput={(e) => setDesc(e.target.value)} maxLength={300} />
          </div>
          <div class="field">
            <label>Kanal für Systemnachrichten (Beitritte usw.)</label>
            <select class="select" value={sys} disabled={!editable} onChange={(e) => setSys(e.target.value)}>
              <option value="">Automatisch (erster Textkanal)</option>
              <option value="none">Keine Systemnachrichten</option>
              {sortedChannels(s.id).filter((c) => c.type === 'text').map((c) => <option value={c.id}>#{c.name}</option>)}
            </select>
          </div>
          {editable && <button class="btn" onClick={save}>Speichern</button>}
        </div>
      </div>
      <h3>Banner (Bild oder GIF)</h3>
      <div class="card">
        <div style={{ height: 150, borderRadius: 14, background: s.banner ? `url(${fileUrl(s.banner)}) center/cover` : 'var(--panel3)', marginBottom: 10 }} />
        {editable && (
          <div class="row">
            <button class="btn sm" onClick={async () => { const r = await pickAndUpload('image/*'); if (r) act('updateServer', { serverId: s.id, banner: r.url }); }}>Banner hochladen</button>
            {s.banner && <button class="btn link sm" onClick={() => act('updateServer', { serverId: s.id, banner: '' })}>Entfernen</button>}
          </div>
        )}
      </div>
    </>
  );
}

function Roles({ s }) {
  const [sel, setSel] = useState(s.roles[s.roles.length - 1]?.id);
  const role = s.roles.find((r) => r.id === sel) || s.roles[0];
  const [draft, setDraft] = useState(null);
  useEffect(() => setDraft({ ...role }), [sel, role?.perms, role?.name, role?.color, role?.hoist]);
  if (!draft) return null;
  const isEveryone = role.id === s.id;
  const dirty = draft.name !== role.name || draft.color !== role.color || draft.perms !== role.perms || draft.hoist !== role.hoist || draft.mentionable !== role.mentionable;
  const save = () => act('updateRole', { serverId: s.id, roleId: role.id, name: draft.name, color: draft.color, perms: draft.perms, hoist: draft.hoist, mentionable: draft.mentionable }, 'Rolle gespeichert');
  const members = Object.keys(s.members).filter((id) => s.members[id].roles.includes(role.id));
  return (
    <>
      <h1>Rollen</h1>
      <div class="row" style={{ alignItems: 'flex-start', gap: 20 }}>
        <div class="role-list" style={{ width: 200, flex: 'none' }}>
          <button class="btn sm" style={{ width: '100%', marginBottom: 8 }} onClick={async () => { const r = await act('createRole', { serverId: s.id, name: 'Neue Rolle', color: ACCENTS[s.roles.length % ACCENTS.length] }); setSel(r.id); }}>
            <Icon name="plus" /> Rolle erstellen
          </button>
          {[...s.roles].reverse().map((r) => (
            <button class={r.id === sel ? 'active' : ''} onClick={() => setSel(r.id)}>
              <span class="role-dot" style={{ background: r.color || 'var(--muted)' }} />
              <span class="ellipsis grow">{r.name}</span>
            </button>
          ))}
          <div class="hint" style={{ marginTop: 8 }}>Oben = höher. Die Farbe der höchsten Rolle zählt.</div>
        </div>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="card">
            <div class="field">
              <label>Rollenname</label>
              <input class="input" value={draft.name} disabled={isEveryone} onInput={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            {!isEveryone && (
              <>
                <div class="field">
                  <label>Farbe</label>
                  <div class="row">
                    <input type="color" value={draft.color || '#99aab5'} onInput={(e) => setDraft({ ...draft, color: e.target.value })} />
                    <div class="swatches">
                      {['', ...ACCENTS].map((c) => <button class={`swatch ${draft.color === c ? 'on' : ''}`} style={{ background: c || 'var(--panel3)', width: 26, height: 26 }} onClick={() => setDraft({ ...draft, color: c })} />)}
                    </div>
                  </div>
                </div>
                <ToggleRow title="Separat in der Mitgliederliste anzeigen" on={draft.hoist} onChange={(v) => setDraft({ ...draft, hoist: v })} />
                <ToggleRow title="Jeder darf @diese-Rolle erwähnen" on={draft.mentionable !== false} onChange={(v) => setDraft({ ...draft, mentionable: v })} />
                <div class="row" style={{ marginTop: 12 }}>
                  <button class="btn ghost sm" onClick={() => act('updateRole', { serverId: s.id, roleId: role.id, dir: 1 })}>↑ Höher</button>
                  <button class="btn ghost sm" onClick={() => act('updateRole', { serverId: s.id, roleId: role.id, dir: -1 })}>↓ Tiefer</button>
                  <span class="grow" />
                  <button class="btn danger sm" onClick={async () => (await confirmDialog('Rolle löschen', `„${role.name}" löschen?`, { ok: 'Löschen' })) && act('deleteRole', { serverId: s.id, roleId: role.id })}>Löschen</button>
                </div>
              </>
            )}
          </div>
          <h3>Berechtigungen</h3>
          {Object.entries(P).map(([k, bit]) => (
            <div class="perm-row">
              <div class="grow">
                <b>{LABELS[k][0]}</b>
                {LABELS[k][1] && <div class="hint">{LABELS[k][1]}</div>}
              </div>
              <Switch on={(draft.perms & bit) === bit} onChange={(v) => setDraft({ ...draft, perms: v ? draft.perms | bit : draft.perms & ~bit })} />
            </div>
          ))}
          {!isEveryone && (
            <>
              <h3>Mitglieder mit dieser Rolle ({members.length})</h3>
              {members.map((id) => (
                <div class="list-row">
                  <Avatar uid={id} size={30} />
                  <span class="grow">{displayName(id, s.id)}</span>
                  <button class="ibtn sm" onClick={() => act('setMemberRoles', { serverId: s.id, userId: id, roles: s.members[id].roles.filter((r) => r !== role.id) })}><Icon name="x" /></button>
                </div>
              ))}
            </>
          )}
          {dirty && (
            <div class="card row" style={{ position: 'sticky', bottom: 0, marginTop: 16, boxShadow: 'var(--shadow)' }}>
              <span class="grow">Ungespeicherte Änderungen</span>
              <button class="btn link" onClick={() => setDraft({ ...role })}>Zurücksetzen</button>
              <button class="btn ok" onClick={save}>Speichern</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Members({ s }) {
  const [q, setQ] = useState('');
  const ids = Object.keys(s.members).filter((id) => !q || displayName(id, s.id).toLowerCase().includes(q.toLowerCase()) || S.users[id]?.username.includes(q.toLowerCase()));
  return (
    <>
      <h1>Mitglieder ({Object.keys(s.members).length})</h1>
      <input class="input" placeholder="Mitglieder suchen" value={q} onInput={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      {ids.map((id) => (
        <div class="list-row" onContextMenu={(e) => memberMenu(e, id, s.id)}>
          <Avatar uid={id} size={36} status serverId={s.id} />
          <div class="grow" style={{ minWidth: 0 }}>
            <b>{displayName(id, s.id)}</b> <span class="muted">@{S.users[id]?.username}</span>
            <div class="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {s.roles.filter((r) => s.members[id].roles.includes(r.id)).map((r) => (
                <span class="chip"><span class="role-dot" style={{ background: r.color || 'var(--muted)', width: 8, height: 8 }} />{r.name}</span>
              ))}
              {s.ownerId === id && <span class="chip">👑 Besitzer</span>}
            </div>
          </div>
          <span class="muted" style={{ fontSize: 12 }}>seit {new Date(s.members[id].joinedAt).toLocaleDateString('de-DE')}</span>
          <button class="ibtn" onClick={(e) => memberMenu(e, id, s.id)}><Icon name="more" /></button>
        </div>
      ))}
    </>
  );
}

function Emojis({ s }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const files = await pickFile('image/png,image/gif,image/jpeg,image/webp', true);
    if (!files?.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const r = await upload(f);
        await act('addEmoji', { serverId: s.id, name: f.name.replace(/\.[^.]+$/, '').replace(/[^\w]/g, '_').slice(0, 32), url: r.url });
      } catch {}
    }
    setBusy(false);
  };
  return (
    <>
      <h1>Emojis</h1>
      <div class="hint" style={{ marginTop: -14, marginBottom: 16 }}>Eigene Emojis (auch animierte GIFs) – bis zu 500 pro Server. Alle Mitglieder können sie überall benutzen, auch in DMs und auf anderen Servern.</div>
      <button class="btn" onClick={add} disabled={busy}>{busy ? <Spinner /> : <Icon name="upload" />} Emojis hochladen</button>
      <h3>{s.emojis.length} Emojis</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {s.emojis.map((e) => (
          <div class="list-row" style={{ margin: 0 }}>
            <img src={emojiUrl(e.id)} style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <span class="grow ellipsis">:{e.name}:</span>
            <button class="ibtn sm" data-tip="Umbenennen" onClick={async () => { const n = await promptDialog('Emoji umbenennen', { value: e.name }); if (n) { await act('removeEmoji', { serverId: s.id, emojiId: e.id }); act('addEmoji', { serverId: s.id, name: n, url: '/uploads/' + e.id }); } }}><Icon name="edit" /></button>
            <button class="ibtn sm red" onClick={() => act('removeEmoji', { serverId: s.id, emojiId: e.id })}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function Sounds({ s }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const f = await pickFile('audio/*');
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast('Sounds dürfen max. 5 MB groß sein', 'error');
    const name = await promptDialog('Sound benennen', { value: f.name.replace(/\.[^.]+$/, '').slice(0, 32), ok: 'Hochladen' });
    if (!name) return;
    const emoji = await promptDialog('Emoji für den Sound (optional)', { value: '🔊', ok: 'Fertig' });
    setBusy(true);
    try {
      const r = await upload(f);
      await act('addSound', { serverId: s.id, name, url: r.url, emoji: emoji || '🔊' }, 'Sound hinzugefügt');
    } catch {}
    setBusy(false);
  };
  return (
    <>
      <h1>Soundboard</h1>
      <div class="hint" style={{ marginTop: -14, marginBottom: 16 }}>Kurze Sounds, die alle im Sprachkanal abspielen können – auf jedem Server und in Anrufen.</div>
      <button class="btn" onClick={add} disabled={busy}>{busy ? <Spinner /> : <Icon name="upload" />} Sound hochladen</button>
      <h3>{s.sounds.length} Sounds</h3>
      {s.sounds.map((x) => (
        <div class="list-row">
          <span style={{ fontSize: 22 }}>{x.emoji || '🔊'}</span>
          <b class="grow">{x.name}</b>
          <button class="ibtn" data-tip="Vorhören" onClick={() => { const a = new Audio(fileUrl(x.url)); a.volume = x.volume ?? 1; a.play(); }}><Icon name="play" /></button>
          <button class="ibtn red" onClick={() => act('removeSound', { serverId: s.id, soundId: x.id })}><Icon name="trash" /></button>
        </div>
      ))}
    </>
  );
}

function Invites({ s }) {
  const [list, setList] = useState(null);
  const load = () => rpc('listInvites', { serverId: s.id }).then(setList).catch((e) => { toast(e.message, 'error'); setList([]); });
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>Einladungen</h1>
      <button class="btn" onClick={() => openModal('invite', { serverId: s.id })}><Icon name="userPlus" /> Neue Einladung</button>
      <h3>Aktive Einladungen</h3>
      {!list && <Spinner />}
      {list?.map((i) => (
        <div class="list-row">
          <code style={{ fontWeight: 800, fontSize: 15 }}>{i.code}</code>
          <span class="grow muted" style={{ fontSize: 13 }}>von {displayName(i.creatorId, s.id)} · {i.uses}{i.maxUses ? '/' + i.maxUses : ''} Nutzungen · {i.expiresAt ? (i.expiresAt < Date.now() ? 'abgelaufen' : 'bis ' + new Date(i.expiresAt).toLocaleString('de-DE')) : 'unbegrenzt'}</span>
          <button class="ibtn" onClick={() => copy(i.code)}><Icon name="copy" /></button>
          <button class="ibtn red" onClick={async () => { await act('deleteInvite', { code: i.code }); load(); }}><Icon name="trash" /></button>
        </div>
      ))}
      {list?.length === 0 && <div class="hint">Keine Einladungen.</div>}
    </>
  );
}

function Bans({ s }) {
  const bans = Object.entries(s.bans || {});
  return (
    <>
      <h1>Banns ({bans.length})</h1>
      {bans.map(([id, b]) => (
        <div class="list-row">
          <Avatar uid={id} size={34} />
          <div class="grow">
            <b>{displayName(id)}</b>
            <div class="hint">{b.reason || 'Kein Grund angegeben'} · {new Date(b.at).toLocaleDateString('de-DE')}</div>
          </div>
          <button class="btn ghost sm" onClick={() => act('unban', { serverId: s.id, userId: id }, 'Bann aufgehoben')}>Entbannen</button>
        </div>
      ))}
      {!bans.length && <div class="hint">Niemand gebannt. 🕊️</div>}
    </>
  );
}

function Danger({ s }) {
  const [to, setTo] = useState('');
  return (
    <>
      <h1>Server verwalten</h1>
      <div class="card">
        <b>Besitz übertragen</b>
        <div class="hint" style={{ margin: '6px 0 10px' }}>Gib den Server an jemand anderen ab. Du verlierst dann die Besitzerrechte.</div>
        <div class="row">
          <select class="select" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Mitglied wählen</option>
            {Object.keys(s.members).filter((id) => id !== S.me.id).map((id) => <option value={id}>{displayName(id, s.id)}</option>)}
          </select>
          <button class="btn" disabled={!to} onClick={async () => (await confirmDialog('Besitz übertragen', `Server wirklich an ${displayName(to, s.id)} übertragen?`, { ok: 'Übertragen' })) && act('transferServer', { serverId: s.id, userId: to }, 'Übertragen')}>Übertragen</button>
        </div>
      </div>
      <div class="card" style={{ borderColor: 'var(--danger)' }}>
        <b style={{ color: 'var(--danger)' }}>Server löschen</b>
        <div class="hint" style={{ margin: '6px 0 10px' }}>Löscht alle Kanäle und Nachrichten unwiderruflich.</div>
        <button class="btn danger" onClick={async () => {
          const n = await promptDialog('Server löschen', { label: `Tippe „${s.name}" zur Bestätigung`, ok: 'Endgültig löschen' });
          if (n === s.name) { await act('deleteServer', { serverId: s.id }); S.serverSettings = null; update(); }
          else if (n !== null) toast('Name stimmt nicht überein', 'error');
        }}>Server löschen</button>
      </div>
    </>
  );
}

export function ServerSettingsView() {
  const { serverId, tab } = S.serverSettings;
  const s = S.servers[serverId];
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !S.modals.length && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  if (!s) {
    S.serverSettings = null;
    return null;
  }
  const close = () => {
    S.serverSettings = null;
    update();
  };
  const setTab = (t) => {
    S.serverSettings = { serverId, tab: t };
    update();
  };
  const tabs = [
    ['overview', 'Übersicht', can(serverId, P.MANAGE_SERVER) || true],
    ['roles', 'Rollen & Rechte', can(serverId, P.MANAGE_ROLES)],
    ['members', 'Mitglieder', true],
    ['emojis', 'Emojis', can(serverId, P.MANAGE_EMOJIS)],
    ['sounds', 'Soundboard', can(serverId, P.MANAGE_EMOJIS)],
    ['invites', 'Einladungen', can(serverId, P.MANAGE_SERVER)],
    ['bans', 'Banns', can(serverId, P.BAN)],
    ['danger', 'Übertragen / Löschen', s.ownerId === S.me.id],
  ].filter((t) => t[2]);
  const C = { overview: Overview, roles: Roles, members: Members, emojis: Emojis, sounds: Sounds, invites: Invites, bans: Bans, danger: Danger }[tab] || Overview;
  return (
    <div class="settings">
      <nav>
        <div class="inner">
          <div class="sh ellipsis">{s.name}</div>
          {tabs.map(([id, l]) => (
            <button class={`${tab === id ? 'active' : ''} ${id === 'danger' ? 'danger' : ''}`} onClick={() => setTab(id)}>
              {l}
            </button>
          ))}
        </div>
      </nav>
      <main>
        <C s={s} />
      </main>
      <div class="close">
        <button onClick={close}>
          <Icon name="x" />
        </button>
        <span>ESC</span>
      </div>
    </div>
  );
}
