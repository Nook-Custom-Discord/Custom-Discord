import { useState } from 'preact/hooks';
import { S, update, prefs, setPref, openModal, openMenu, openPopout, confirmDialog, promptDialog, toast } from './store';
import { act, rpc, navigate, serverUnread, sortedChannels, isUnread, displayName, channelTitle, voiceMembers, can, P, dmList, roleColor, hoistRole, markRead, copy, openDM, fileUrl, serverIdOf, notifyLevel, updateBadge } from './api';
import { Avatar, ServerIcon, ChannelIcon, Name, STATUS_LABEL, GroupIcon, onlineCount, useIndicator, PlayTime } from './ui';
import { Icon, LogoMark } from './icons';
import { V } from './voice';
import { CallIsland, voiceUserMenu } from './voiceui';
import { EmojiView } from './picker';
import { CLIP, CLIPS_SUPPORTED, saveClip } from './clips';

const IS_MAC = window.nook?.platform === 'darwin' || /Mac/.test(navigator.platform);

// ---------- Obere Leiste ----------
export function TopBar() {
  const order = prefs.serverOrder.filter((id) => S.servers[id]);
  for (const id of Object.keys(S.servers)) if (!order.includes(id)) order.push(id);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const home = S.view.serverId === '@me';
  let dmUnread = 0;
  for (const c of dmList()) if (isUnread(c)) dmUnread += Math.max(1, S.reads[c.id]?.mentions || 0);
  const incoming = Object.values(S.rel).filter((t) => t === 'incoming').length;
  const homeBadge = dmUnread + incoming;
  const me = S.me;

  const serverMenu = (e, s) =>
    openMenu(e, [
      { label: 'Als gelesen markieren', icon: 'check', onClick: () => Object.values(S.channels).filter((c) => serverIdOf(c) === s.id).forEach((c) => markRead(c.id)) },
      can(s.id, P.CREATE_INVITE) && { label: 'Leute einladen', icon: 'userPlus', onClick: () => openModal('invite', { serverId: s.id }) },
      { label: 'Benachrichtigungen', icon: 'bell', onClick: () => openModal('notif', { serverId: s.id }) },
      { label: 'Server-Profil bearbeiten', icon: 'edit', onClick: () => openModal('serverProfile', { serverId: s.id }) },
      (can(s.id, P.MANAGE_SERVER) || can(s.id, P.MANAGE_ROLES)) && { label: 'Server-Einstellungen', icon: 'gear', onClick: () => { S.serverSettings = { serverId: s.id, tab: 'overview' }; update(); } },
      '-',
      { label: 'Server-ID kopieren', icon: 'copy', onClick: () => copy(s.id) },
      s.ownerId !== S.me.id && { label: 'Server verlassen', danger: true, icon: 'logout', onClick: async () => (await confirmDialog(`„${s.name}" verlassen`, 'Du kannst nur mit einer neuen Einladung zurück.', { ok: 'Verlassen' })) && act('leaveServer', { serverId: s.id }) },
    ]);

  return (
    <div class="topbar">
      <button class={`logo-btn ${home ? 'active' : ''}`} onClick={() => { navigate('@me', S.view.serverId === '@me' ? S.view.channelId : null); S.mobileNav = 'nav'; update(); }} data-tip="Freunde & Chats">
        <div class="logo-mark">
          <LogoMark />
        </div>
        Nook
        {homeBadge > 0 && <span class="badge">{homeBadge}</span>}
      </button>
      <div class="sdock">
        <div class="stabs">
          {order.map((id) => {
            const s = S.servers[id];
            const { unread, mentions } = serverUnread(id);
            const active = S.view.serverId === id;
            const inVoice = V.serverId === id;
            return (
              <button
                class={`stab ${active ? 'active' : ''} ${unread && !active ? 'unread' : ''} ${overId === id && dragId !== id ? 'dragover' : ''}`}
                draggable
                onDragStart={() => setDragId(id)}
                onDragOver={(e) => { e.preventDefault(); setOverId(id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDrop={() => {
                  if (!dragId || dragId === id) return;
                  const o = order.filter((x) => x !== dragId);
                  o.splice(o.indexOf(id), 0, dragId);
                  setPref('serverOrder', o);
                  setDragId(null);
                  setOverId(null);
                }}
                onClick={() => navigate(id)}
                onContextMenu={(e) => serverMenu(e, s)}
              >
                <ServerIcon server={s} size={26} />
                <span class="ellipsis">{s.name}</span>
                {inVoice && <Icon name="speaker" size={14} style={{ color: 'var(--ok)', flex: 'none' }} />}
                {mentions > 0 && <span class="badge">{mentions}</span>}
              </button>
            );
          })}
        </div>
        <button class="stab-add" data-tip="Server erstellen oder beitreten" onClick={() => openModal('createServer')}>
          <Icon name="plus" />
        </button>
      </div>
      <div class="spacer" />
      <CallIsland />
      <div class="spacer" />
      <button class="search-pill" data-tip="Schnell wechseln" onClick={() => openModal('quickSwitch')}>
        <Icon name="search" size={16} />
        <span class="sp-t">Suchen</span>
        <span class="kbd">{IS_MAC ? '⌘K' : 'Strg K'}</span>
      </button>
      <div class="me-dock">
        {CLIPS_SUPPORTED && prefs.clipsOn !== false && <ClipButton />}
        <button class={`ibtn sm ${V.muted ? 'red' : ''}`} data-tip={V.muted ? 'Stummschaltung aufheben' : 'Stummschalten'} onClick={() => V.toggleMute()}>
          <Icon name={V.muted ? 'micOff' : 'mic'} />
        </button>
        <button class={`ibtn sm ${V.deafened ? 'red' : ''}`} data-tip={V.deafened ? 'Ton an' : 'Ton aus'} onClick={() => V.toggleDeafen()}>
          <Icon name={V.deafened ? 'headphonesOff' : 'headphones'} />
        </button>
        <button class="ibtn sm md-gear" data-tip="Einstellungen" onClick={() => { S.settings = { tab: 'account' }; update(); }}>
          <Icon name="gear" />
        </button>
        <button class="me-chip" onClick={(e) => openPopout(e, 'status', { prefer: 'bottom' })}>
          <Avatar uid={me.id} size={32} status />
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div class="n ellipsis">{me.displayName}</div>
            <div class="s ellipsis">{me.customStatus?.text || (S.activities[me.id] ? `${S.activities[me.id].type || 'Spielt'} ${S.activities[me.id].name}` : STATUS_LABEL[me.status])}</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// Clip-Knopf oben rechts: roter Punkt = Aufnahme läuft, Klick speichert die letzten Sekunden
function ClipButton() {
  const on = CLIP.state === 'rec';
  const tip = CLIP.saving
    ? 'Clip wird gespeichert …'
    : on
      ? `Clip speichern – letzte ${prefs.clipLength || 30} s`
      : CLIP.state === 'starting'
        ? 'Aufnahme startet …'
        : CLIP.state === 'error'
          ? CLIP.error
          : prefs.clipWhen === 'always'
            ? 'Clips: Aufnahme aus'
            : 'Clips: startet automatisch im Spiel';
  return (
    <button
      class={`ibtn sm clip-btn ${on ? 'rec' : ''} ${CLIP.saving ? 'saving' : ''} ${CLIP.state === 'error' ? 'err' : ''}`}
      data-tip={tip}
      onClick={() => (on ? saveClip() : (S.settings = { tab: 'games' }, update()))}
      onContextMenu={(e) => { e.preventDefault(); S.settings = { tab: 'games' }; update(); }}
    >
      <Icon name="clip" />
    </button>
  );
}

// ---------- Home-Seitenleiste ----------
const DM_FILTERS = [
  ['all', 'Alle'],
  ['unread', 'Ungelesen'],
  ['groups', 'Gruppen'],
];

export function HomeSidebar() {
  const [filter, setFilter] = useState('all');
  const [fRef, fInd] = useIndicator();
  const all = dmList();
  const dms = all.filter((c) => filter === 'all' || (filter === 'unread' ? isUnread(c) : c.type === 'group'));
  const incoming = Object.values(S.rel).filter((t) => t === 'incoming').length;
  const friendsOnline = Object.entries(S.rel).filter(([id, t]) => t === 'friend' && S.users[id]?.status && S.users[id].status !== 'offline').length;
  return (
    <div class="panel sidebar home">
      <div class="home-head">
        <div class="hh-title">Chats</div>
        <button class="ibtn" data-tip="Neue Gruppe" onClick={() => openModal('createGroup')}>
          <Icon name="plus" />
        </button>
      </div>
      <div class="sb-scroll">
        <button class={`friends-tile ${!S.view.channelId ? 'active' : ''}`} onClick={() => navigate('@me', null)}>
          <span class="ft-ic">
            <Icon name="users" />
          </span>
          <span class="grow" style={{ minWidth: 0 }}>
            <b>Freunde</b>
            <small class="ellipsis">
              {friendsOnline} online
              {incoming > 0 && ` · ${incoming} ${incoming === 1 ? 'Anfrage' : 'Anfragen'}`}
            </small>
          </span>
          {incoming > 0 && <span class="badge">{incoming}</span>}
        </button>
        <div class="dm-filter" ref={fRef}>
          {fInd}
          {DM_FILTERS.map(([v, l]) => (
            <button class={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
        {dms.map((c) => (
          <DmItem ch={c} key={c.id} />
        ))}
        {!dms.length && (
          <div class="hint" style={{ padding: '6px 10px' }}>
            {filter === 'unread' ? 'Alles gelesen. 🎉' : filter === 'groups' ? 'Noch keine Gruppen – oben mit + eine starten.' : 'Noch keine Chats. Füge Freunde hinzu und schreib ihnen!'}
          </div>
        )}
      </div>
    </div>
  );
}

function DmItem({ ch }) {
  const active = S.view.channelId === ch.id;
  const unread = isUnread(ch) && !active;
  const inCall = voiceMembers(ch.id).length > 0;
  const other = ch.type === 'dm' ? ch.recipients.find((r) => r !== S.me.id) : null;
  const u = other && S.users[other];
  const sub = ch.type === 'group' ? ch.topic || `${ch.recipients.length} Mitglieder · ${onlineCount(ch.recipients)} online` : u?.customStatus?.text || (S.activities[other] ? `🎮 ${S.activities[other].type || 'Spielt'} ${S.activities[other].name}` : '');
  const menu = (e) =>
    openMenu(e, [
      { label: 'Als gelesen markieren', icon: 'check', onClick: () => markRead(ch.id) },
      other && { label: 'Profil', icon: 'users', onClick: () => openModal('profile', { uid: other }) },
      { label: 'Anrufen', icon: 'phone', onClick: () => { navigate('@me', ch.id); V.join(ch.id); } },
      ch.type === 'group' && { label: 'Gruppeneinstellungen', icon: 'gear', onClick: () => openModal('groupSettings', { channelId: ch.id }) },
      ch.type === 'dm' && { label: 'Freunde hinzufügen (neue Gruppe)', icon: 'userPlus', onClick: () => openModal('createGroup', { channelId: ch.id }) },
      ch.type === 'group' && { label: 'Gruppe umbenennen', icon: 'edit', onClick: async () => { const n = await promptDialog('Gruppe umbenennen', { value: ch.name }); if (n !== null) act('updateGroup', { channelId: ch.id, name: n }); } },
      { label: prefs.mutedChannels[ch.id] ? 'Stummschaltung aufheben' : 'Stummschalten', icon: 'bellOff', onClick: () => { prefs.mutedChannels[ch.id] ? delete prefs.mutedChannels[ch.id] : (prefs.mutedChannels[ch.id] = true); setPref('mutedChannels', prefs.mutedChannels); } },
      '-',
      ch.type === 'dm' && { label: 'Chat schließen', icon: 'x', onClick: () => closeDm(ch) },
      ch.type === 'group' && { label: 'Gruppe verlassen', danger: true, icon: 'logout', onClick: async () => (await confirmDialog('Gruppe verlassen', `Willst du „${channelTitle(ch)}" wirklich verlassen?`, { ok: 'Verlassen' })) && act('groupRemove', { channelId: ch.id, userId: S.me.id }) },
    ]);
  return (
    <div class={`dm-item ${active ? 'active' : ''} ${unread ? 'unread' : ''} ${u?.nameplate ? 'nameplate np-' + u.nameplate : ''}`} onClick={() => navigate('@me', ch.id)} onContextMenu={menu}>
      {ch.type === 'dm' ? (
        <Avatar uid={other} size={34} status />
      ) : (
        <GroupIcon ch={ch} size={34} />
      )}
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="n ellipsis">{channelTitle(ch)}</div>
        {sub && <div class="s ellipsis">{sub}</div>}
      </div>
      {inCall && <Icon name="phone" size={16} style={{ color: 'var(--ok)' }} />}
      {unread && <span class="badge">{Math.max(1, S.reads[ch.id]?.mentions || 0)}</span>}
      <button class="ibtn sm x" onClick={(e) => { e.stopPropagation(); closeDm(ch); }}>
        <Icon name="x" />
      </button>
    </div>
  );
}

function closeDm(ch) {
  S.me.closedDMs = { ...(S.me.closedDMs || {}), [ch.id]: Date.now() };
  rpc('closeDM', { channelId: ch.id }).catch(() => {});
  if (S.view.channelId === ch.id) navigate('@me', null);
  update();
}

// ---------- Server-Seitenleiste ----------
export function ServerSidebar({ serverId }) {
  const s = S.servers[serverId];
  if (!s) return null;
  const chans = sortedChannels(serverId);
  const cats = [{ id: null, name: '' }, ...s.categories];
  const manage = can(serverId, P.MANAGE_CHANNELS);

  const headerMenu = (e) =>
    openMenu(e, [
      can(serverId, P.CREATE_INVITE) && { label: 'Leute einladen', icon: 'userPlus', onClick: () => openModal('invite', { serverId }) },
      (can(serverId, P.MANAGE_SERVER) || can(serverId, P.MANAGE_ROLES) || can(serverId, P.BAN) || can(serverId, P.MANAGE_EMOJIS)) && { label: 'Server-Einstellungen', icon: 'gear', onClick: () => { S.serverSettings = { serverId, tab: 'overview' }; update(); } },
      manage && { label: 'Kanal erstellen', icon: 'plus', onClick: () => openModal('createChannel', { serverId }) },
      manage && { label: 'Kategorie erstellen', icon: 'plus', onClick: async () => { const n = await promptDialog('Kategorie erstellen', { label: 'Name', ok: 'Erstellen' }); if (n) act('createCategory', { serverId, name: n }); } },
      '-',
      { label: 'Benachrichtigungen', icon: 'bell', onClick: () => openModal('notif', { serverId }) },
      { label: 'Server-Profil bearbeiten', icon: 'edit', onClick: () => openModal('serverProfile', { serverId }) },
      { label: 'Alles als gelesen markieren', icon: 'check', onClick: () => chans.forEach((c) => markRead(c.id)) },
      '-',
      s.ownerId !== S.me.id && { label: 'Server verlassen', danger: true, icon: 'logout', onClick: async () => (await confirmDialog(`„${s.name}" verlassen`, 'Du kannst nur mit einer neuen Einladung zurück.', { ok: 'Verlassen' })) && act('leaveServer', { serverId }) },
    ]);

  return (
    <div class="panel sidebar">
      <div class="sb-head">
        {s.banner && <div class="sb-banner" style={{ backgroundImage: `url(${fileUrl(s.banner)})` }} />}
        <button class="sb-title" onClick={headerMenu}>
          <ServerIcon server={s} size={28} />
          <span class="grow ellipsis">{s.name}</span>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      <div class="sb-scroll">
        {cats.map((cat) => {
          const list = chans.filter((c) => c.categoryId === cat.id || (cat.id === null && !s.categories.some((x) => x.id === c.categoryId)));
          if (cat.id === null && !list.length) return null;
          const collapsed = prefs.collapsed[cat.id];
          return (
            <div key={cat.id || 'none'}>
              {cat.id && (
                <div
                  class={`cat ${collapsed ? 'collapsed' : ''}`}
                  onClick={() => { prefs.collapsed[cat.id] = !collapsed; setPref('collapsed', prefs.collapsed); }}
                  onContextMenu={(e) =>
                    manage &&
                    openMenu(e, [
                      { label: 'Kanal erstellen', icon: 'plus', onClick: () => openModal('createChannel', { serverId, categoryId: cat.id }) },
                      { label: 'Umbenennen', icon: 'edit', onClick: async () => { const n = await promptDialog('Kategorie umbenennen', { value: cat.name }); if (n) act('updateCategory', { serverId, categoryId: cat.id, name: n }); } },
                      { label: 'Nach oben', onClick: () => act('updateCategory', { serverId, categoryId: cat.id, dir: -1 }) },
                      { label: 'Nach unten', onClick: () => act('updateCategory', { serverId, categoryId: cat.id, dir: 1 }) },
                      '-',
                      { label: 'Kategorie löschen', danger: true, icon: 'trash', onClick: async () => (await confirmDialog('Kategorie löschen', `„${cat.name}" löschen? Die Kanäle bleiben erhalten.`, { ok: 'Löschen' })) && act('deleteCategory', { serverId, categoryId: cat.id }) },
                    ])
                  }
                >
                  <Icon name="chevron" class="chev" />
                  <span class="ellipsis">{cat.name}</span>
                  {manage && (
                    <button class="ibtn sm add" data-tip="Kanal erstellen" onClick={(e) => { e.stopPropagation(); openModal('createChannel', { serverId, categoryId: cat.id }); }}>
                      <Icon name="plus" />
                    </button>
                  )}
                </div>
              )}
              {list
                .filter((c) => !collapsed || c.id === S.view.channelId || isUnread(c) || voiceMembers(c.id).length)
                .map((c) => (
                  <ChannelItem ch={c} serverId={serverId} key={c.id} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChannelItem({ ch, serverId }) {
  const active = S.view.channelId === ch.id;
  const isVoice = ch.type === 'voice' || ch.type === 'stage';
  const unread = !isVoice && isUnread(ch) && !active && notifyLevel(ch) !== 'none';
  const mentions = S.reads[ch.id]?.mentions || 0;
  const manage = can(serverId, P.MANAGE_CHANNELS);
  const members = isVoice ? voiceMembers(ch.id) : [];
  const threads = ch.type === 'text' || ch.type === 'announce' ? Object.values(S.channels).filter((t) => t.type === 'thread' && t.parentId === ch.id && !t.archived && (Date.now() - parseInt(t.lastMessageId?.slice(0, 9) || t.id.slice(0, 9), 36) < 3 * 864e5 || S.panel?.threadId === t.id)) : [];
  const muted = prefs.mutedChannels[ch.id];
  const click = () => {
    navigate(serverId, ch.id);
    if (isVoice && V.channelId !== ch.id) V.join(ch.id);
  };
  const menu = (e) =>
    openMenu(e, [
      !isVoice && { label: 'Als gelesen markieren', icon: 'check', onClick: () => markRead(ch.id) },
      isVoice && V.channelId !== ch.id && { label: 'Beitreten', icon: 'speaker', onClick: () => V.join(ch.id) },
      { label: muted ? 'Stummschaltung aufheben' : 'Kanal stummschalten', icon: 'bellOff', onClick: () => { muted ? delete prefs.mutedChannels[ch.id] : (prefs.mutedChannels[ch.id] = true); setPref('mutedChannels', prefs.mutedChannels); updateBadge(); } },
      !isVoice && { label: 'Benachrichtigungen', icon: 'bell', onClick: () => openModal('notif', { serverId, channelId: ch.id }) },
      can(serverId, P.CREATE_INVITE) && { label: 'Einladen', icon: 'userPlus', onClick: () => openModal('invite', { serverId }) },
      { label: 'Kanal-ID kopieren', icon: 'copy', onClick: () => copy(ch.id) },
      manage && '-',
      manage && { label: 'Kanal bearbeiten', icon: 'gear', onClick: () => openModal('channelSettings', { channelId: ch.id }) },
      manage && { label: 'Nach oben', onClick: () => act('moveChannel', { channelId: ch.id, dir: -1 }) },
      manage && { label: 'Nach unten', onClick: () => act('moveChannel', { channelId: ch.id, dir: 1 }) },
      manage && { label: 'Kanal löschen', danger: true, icon: 'trash', onClick: async () => (await confirmDialog('Kanal löschen', `#${ch.name} und alle Nachrichten endgültig löschen?`, { ok: 'Löschen' })) && act('deleteChannel', { channelId: ch.id }) },
    ]);
  return (
    <>
      <button class={`chan ${active ? 'active' : ''} ${unread ? 'unread' : ''} ${muted ? 'muted-ch' : ''}`} onClick={click} onContextMenu={menu}>
        <ChannelIcon ch={ch} />
        <span class="ellipsis grow">{ch.name}</span>
        {isVoice && ch.userLimit > 0 && <span class="muted" style={{ fontSize: 11 }}>{members.length}/{ch.userLimit}</span>}
        {mentions > 0 && !active ? (
          <span class="badge">{mentions}</span>
        ) : (
          <span class="acts">
            {can(serverId, P.CREATE_INVITE) && (
              <span class="ibtn sm" data-tip="Einladen" onClick={(e) => { e.stopPropagation(); openModal('invite', { serverId }); }}>
                <Icon name="userPlus" />
              </span>
            )}
            {manage && (
              <span class="ibtn sm" data-tip="Bearbeiten" onClick={(e) => { e.stopPropagation(); openModal('channelSettings', { channelId: ch.id }); }}>
                <Icon name="gear" />
              </span>
            )}
          </span>
        )}
      </button>
      {threads.map((t) => (
        <button class={`chan thread ${S.panel?.threadId === t.id ? 'active' : ''} ${isUnread(t) ? 'unread' : ''}`} onClick={() => navigate(serverId, ch.id, t.id)}>
          <span class="ellipsis">{t.name}</span>
        </button>
      ))}
      {members.length > 0 && (
        <div class="vusers">
          {members.map((m) => (
            <div class="vuser" onClick={(e) => openPopout(e, 'profile', { uid: m.uid, serverId })} onContextMenu={(e) => voiceUserMenu(e, m.uid, serverId)}>
              <Avatar uid={m.uid} size={22} serverId={serverId} speaking={V.speaking.has(m.uid)} round deco={false} />
              <span class="ellipsis" style={{ color: V.speaking.has(m.uid) ? 'var(--text)' : undefined }}>{displayName(m.uid, serverId)}</span>
              <span class="icons">
                {m.screenStreamId && <span class="live">LIVE</span>}
                {m.video && <Icon name="video" />}
                {(m.muted || m.serverMuted) && <Icon name="micOff" style={{ color: m.serverMuted ? 'var(--danger)' : undefined }} />}
                {(m.deafened || m.serverDeafened) && <Icon name="headphonesOff" style={{ color: m.serverDeafened ? 'var(--danger)' : undefined }} />}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Mitgliederliste ----------
export function MemberList({ serverId, ch }) {
  let ids;
  const s = serverId && S.servers[serverId];
  if (s) {
    ids = Object.keys(s.members);
    if (ch?.private) {
      // nur Leute mit Zugriff
      ids = ids.filter((id) => id === s.ownerId || (ch.allowedRoles || []).some((r) => s.members[id].roles.includes(r)) || s.roles.some((r) => s.members[id].roles.includes(r.id) && r.perms & (P.ADMIN | P.MANAGE_CHANNELS)));
    }
  } else ids = ch?.recipients || [];
  const online = [];
  const offline = [];
  for (const id of ids) ((S.users[id]?.status || 'offline') === 'offline' ? offline : online).push(id);
  const byName = (a, b) => displayName(a, serverId).localeCompare(displayName(b, serverId));
  const groups = [];
  if (s) {
    const hoisted = [...s.roles].reverse().filter((r) => r.hoist && r.id !== s.id);
    const used = new Set();
    for (const r of hoisted) {
      const list = online.filter((id) => !used.has(id) && hoistRole(id, s)?.id === r.id).sort(byName);
      list.forEach((id) => used.add(id));
      if (list.length) groups.push({ name: r.name, ids: list, color: r.color });
    }
    const rest = online.filter((id) => !used.has(id)).sort(byName);
    if (rest.length) groups.push({ name: 'Online', ids: rest });
  } else if (online.length) groups.push({ name: 'Online', ids: online.sort(byName) });
  if (offline.length) groups.push({ name: 'Offline', ids: offline.sort(byName), offline: true });

  return (
    <div class="panel members">
      <div class="chead" style={{ paddingLeft: 16 }}>
        <div class="title">Mitglieder</div>
        <span class="muted" style={{ fontSize: 13 }}>{ids.length}</span>
      </div>
      <div class="sb-scroll">
        {groups.map((g) => (
          <>
            <div class="sb-section">
              {g.color && <i class="rdot" style={{ background: g.color }} />}
              {g.name} <span class="sb-count">{g.ids.length}</span>
            </div>
            {g.ids.map((id) => (
              <MemberRow uid={id} serverId={serverId} offline={g.offline} ch={ch} />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

export function memberMenu(e, uid, serverId, ch) {
  const s = serverId && S.servers[serverId];
  const me = uid === S.me.id;
  const r = S.rel[uid];
  const items = [
    { label: 'Profil', icon: 'users', onClick: () => openModal('profile', { uid, serverId }) },
    !me && { label: 'Nachricht', icon: 'chat', onClick: () => openDM(uid) },
    !me && { label: 'Anrufen', icon: 'phone', onClick: async () => { const c = await openDM(uid); V.join(c.id); } },
    !me && r !== 'friend' && r !== 'outgoing' && r !== 'blocked' && { label: 'Als Freund hinzufügen', icon: 'userPlus', onClick: () => act('friendRequest', { username: S.users[uid].username }, 'Anfrage gesendet') },
    !me && r === 'friend' && { label: 'Freund entfernen', icon: 'x', onClick: async () => (await confirmDialog('Freund entfernen', `${displayName(uid)} aus deiner Freundesliste entfernen?`, { ok: 'Entfernen' })) && act('friendRemove', { userId: uid }) },
    '-',
  ];
  if (s) {
    if (me || can(serverId, P.MANAGE_NICKS)) items.push({ label: me ? 'Server-Profil bearbeiten' : 'Nickname ändern', icon: 'edit', onClick: async () => { if (me) return openModal('serverProfile', { serverId }); const n = await promptDialog('Nickname ändern', { value: s.members[uid]?.nick || '', placeholder: displayName(uid) }); if (n !== null) act('setServerProfile', { serverId, userId: uid, nick: n }); } });
    if (can(serverId, P.MANAGE_ROLES)) {
      items.push('-');
      for (const role of s.roles.filter((x) => x.id !== serverId)) {
        const has = s.members[uid]?.roles.includes(role.id);
        items.push({
          label: role.name,
          checked: has,
          keep: true,
          onClick: () => act('setMemberRoles', { serverId, userId: uid, roles: has ? s.members[uid].roles.filter((x) => x !== role.id) : [...s.members[uid].roles, role.id] }),
        });
      }
    }
    if (!me && uid !== s.ownerId) {
      items.push('-');
      if (can(serverId, P.KICK)) items.push({ label: `${displayName(uid, serverId)} kicken`, danger: true, icon: 'boot', onClick: async () => (await confirmDialog('Mitglied kicken', `${displayName(uid, serverId)} vom Server kicken? Mit einer Einladung kann die Person zurück.`, { ok: 'Kicken' })) && act('kick', { serverId, userId: uid }) });
      if (can(serverId, P.BAN)) items.push({ label: `${displayName(uid, serverId)} bannen`, danger: true, icon: 'ban', onClick: () => openModal('ban', { serverId, userId: uid }) });
    }
  }
  if (ch?.type === 'group' && ch.ownerId === S.me.id && !me) {
    items.push('-');
    items.push({ label: 'Zum Gruppenbesitzer machen', icon: 'crown', onClick: () => act('updateGroup', { channelId: ch.id, ownerId: uid }) });
    items.push({ label: 'Aus Gruppe entfernen', danger: true, icon: 'x', onClick: () => act('groupRemove', { channelId: ch.id, userId: uid }) });
  }
  if (!me) {
    items.push('-');
    items.push(r === 'blocked' ? { label: 'Blockierung aufheben', onClick: () => act('unblock', { userId: uid }) } : { label: 'Blockieren', danger: true, icon: 'ban', onClick: async () => (await confirmDialog('Blockieren', `${displayName(uid)} blockieren? Ihr könnt euch dann keine DMs mehr schreiben und du siehst die Nachrichten nicht mehr hervorgehoben.`, { ok: 'Blockieren' })) && act('block', { userId: uid }) });
  }
  items.push({ label: 'Nutzer-ID kopieren', icon: 'copy', onClick: () => copy(uid) });
  openMenu(e, items);
}

function MemberRow({ uid, serverId, offline, ch }) {
  const u = S.users[uid];
  if (!u) return null;
  const color = roleColor(uid, serverId);
  const act0 = S.activities[uid];
  const owner = serverId ? S.servers[serverId]?.ownerId === uid : ch?.type === 'group' && ch.ownerId === uid;
  const vs = S.voice[uid];
  return (
    <button class={`member ${offline ? 'offline' : ''} ${u.nameplate ? 'nameplate np-' + u.nameplate : ''}`} onClick={(e) => openPopout(e, 'profile', { uid, serverId, prefer: 'left' })} onContextMenu={(e) => memberMenu(e, uid, serverId, ch)}>
      <Avatar uid={uid} size={34} status serverId={serverId} />
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="n">
          <span class="ellipsis">
            <Name uid={uid} serverId={serverId} color={color} />
          </span>
          {owner && <Icon name="crown" class="owner-crown" />}
        </div>
        {!offline && (u.customStatus || act0 || vs) && (
          <div class="s ellipsis">
            {act0 ? (
              <>
                {act0.type || 'Spielt'} <b>{act0.name}</b>
                {act0.since && (
                  <span class="play-time">
                    {' · '}
                    <PlayTime since={act0.since} />
                  </span>
                )}
              </>
            ) : u.customStatus ? (
              <>
                {u.customStatus.emoji && <EmojiView e={u.customStatus.emoji} size={12} />} {u.customStatus.text}
              </>
            ) : vs ? (
              <>🔊 Im Sprachkanal</>
            ) : null}
          </div>
        )}
      </div>
    </button>
  );
}
