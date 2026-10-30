import { useState, useEffect } from 'preact/hooks';
import { S, update, prefs, openModal, closeModal, openPopout, toast, confirmDialog } from './store';
import { act, rpc, openDM, fileUrl, displayName, roleColor, copy, navigate, logout } from './api';
import { Avatar, Name, NameText, STATUS_LABEL, StatusDot, Modal, ServerIcon, colorFor, tone, SegBox, PlayTime } from './ui';
import { EffectLayer, Frame } from './cosmetics';
import { Icon } from './icons';
import { Md } from './message';
import { V } from './voice';
import { EmojiView, EmojiPicker } from './picker';
import { memberMenu } from './sidebar';
import { withTransition } from './fx';
import { toggleGlass } from './glass';

export { DECORATIONS, EFFECTS, NAME_FONTS as FONTS } from './cosmetics';

// Profilkarte – wird auch für die Vorschau in den Einstellungen benutzt
export function ProfileCard({ uid, serverId, preview, actions = true, onClose }) {
  const base = S.users[uid] || {};
  const u = { ...base, ...(preview || {}) };
  const member = serverId && S.servers[serverId]?.members[uid];
  const banner = fileUrl((preview?.banner ?? member?.banner) || u.banner);
  const avatar = fileUrl((preview?.avatar ?? member?.avatar) || u.avatar);
  const bio = member?.bio || u.bio;
  const themed = u.theme && u.theme[0];
  const style = { '--uacc': u.accent || colorFor(uid), ...(themed ? { '--t1': u.theme[0], '--t2': u.theme[1] || u.theme[0], '--pc-bg': u.theme[0] } : {}) };
  const roles = member ? S.servers[serverId].roles.filter((r) => member.roles.includes(r.id)) : [];
  const me = uid === S.me.id;
  const rel = S.rel[uid];
  const act0 = S.activities[uid];
  const vs = S.voice[uid];
  const [note, setNote] = useState(S.me.notes?.[uid] || '');
  const nameStyle = u.nameStyle;
  return (
    <div class={`pcard ${themed ? 'themed' : ''} ${u.frame ? 'framed fr-' + u.frame : ''}`} style={style} onClick={(e) => e.stopPropagation()}>
      <EffectLayer id={u.effect} key={u.effect} />
      <Frame id={u.frame} />
      <div class="pbanner" style={{ '--pbanner': banner ? `url(${banner})` : tone(u.accent) || colorFor(uid) }} />
      <div class="pav">
        <Avatar uid={uid} size={92} status={!preview} src={avatar} name={u.displayName} decoration={preview ? u.decoration || '' : undefined} key={preview ? u.decoration : uid} />
      </div>
      {(u.customStatus?.text || u.customStatus?.emoji) && (
        <div class="cstat ellipsis">
          {u.customStatus.emoji && <EmojiView e={u.customStatus.emoji} size={16} />} {u.customStatus.text}
        </div>
      )}
      <div class="pbody">
        <div class="pinner">
          <div class="dn">
            {preview ? (
              <NameText text={u.displayName} ns={nameStyle} />
            ) : (
              <Name uid={uid} serverId={serverId} />
            )}
          </div>
          <div class="un">
            @{u.username}
            {u.pronouns && <span> · {u.pronouns}</span>}
          </div>
          {act0 && (
            <div class="sec">
              <h4>{act0.type || 'Spielt'}</h4>
              <div class="row act-row">
                <span class="act-ic">🎮</span>
                <div style={{ minWidth: 0 }}>
                  <b class="ellipsis" style={{ display: 'block' }}>{act0.name}</b>
                  {act0.since && (
                    <span class="act-time">
                      <PlayTime since={act0.since} clock /> {act0.auto ? 'gespielt' : 'vergangen'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {vs && S.channels[vs.channelId] && (
            <div class="sec">
              <h4>Im Sprachkanal</h4>
              <div class="row" style={{ cursor: 'pointer' }} onClick={() => navigate(S.channels[vs.channelId].serverId || '@me', vs.channelId)}>
                <Icon name="speaker" size={16} /> {S.channels[vs.channelId].name || 'Anruf'} {vs.screenStreamId && <span class="live">LIVE</span>}
              </div>
            </div>
          )}
          {bio && (
            <div class="sec">
              <h4>Über mich</h4>
              <div class="bio">
                <Md text={bio} serverId={serverId} />
              </div>
            </div>
          )}
          <div class="sec">
            <h4>Mitglied seit</h4>
            <div style={{ fontSize: 13.5 }}>
              {new Date(u.createdAt || Date.now()).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
              {member && <span class="muted"> · auf dem Server seit {new Date(member.joinedAt).toLocaleDateString('de-DE')}</span>}
            </div>
          </div>
          {roles.length > 0 && (
            <div class="sec">
              <h4>Rollen</h4>
              <div class="roles">
                {roles.map((r) => (
                  <span class="role-pill">
                    <i style={{ background: r.color || 'var(--muted)' }} />
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!me && !preview && (
            <div class="sec">
              <h4>Notiz (nur für dich)</h4>
              <textarea class="note" rows={1} placeholder="Klicke, um eine Notiz hinzuzufügen" value={note} onInput={(e) => setNote(e.target.value)} onBlur={() => { rpc('setNote', { userId: uid, note }); S.me.notes = { ...(S.me.notes || {}), [uid]: note }; }} />
            </div>
          )}
          {actions && !preview && (
            <div class="row" style={{ marginTop: 14, gap: 6 }}>
              {me ? (
                <button class="btn ghost sm grow" onClick={() => { onClose?.(); S.settings = { tab: 'profile' }; update(); }}>
                  <Icon name="edit" /> Profil bearbeiten
                </button>
              ) : (
                <>
                  <button class="btn sm grow" onClick={() => { onClose?.(); openDM(uid); }}>
                    <Icon name="chat" /> Nachricht
                  </button>
                  <button class="ibtn" data-tip="Anrufen" onClick={async () => { onClose?.(); const c = await openDM(uid); V.join(c.id); }}>
                    <Icon name="phone" />
                  </button>
                  {rel !== 'friend' && rel !== 'blocked' && (
                    <button class="ibtn" data-tip={rel === 'outgoing' ? 'Anfrage gesendet' : rel === 'incoming' ? 'Anfrage annehmen' : 'Freund hinzufügen'} onClick={() => (rel === 'incoming' ? act('friendAccept', { userId: uid }) : rel !== 'outgoing' && act('friendRequest', { username: u.username }, 'Anfrage gesendet'))}>
                      <Icon name={rel === 'outgoing' ? 'check' : 'userPlus'} />
                    </button>
                  )}
                </>
              )}
              <button class="ibtn" data-tip="Mehr" onClick={(e) => memberMenu(e, uid, serverId)}>
                <Icon name="more" />
              </button>
              {!onClose?.isModal && (
                <button class="ibtn" data-tip="Vollständiges Profil" onClick={() => { onClose?.(); openModal('profile', { uid, serverId }); }}>
                  <Icon name="maximize" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProfileModal({ uid, serverId }) {
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState('info');
  useEffect(() => {
    rpc('getUserProfile', { userId: uid }).then(setInfo).catch(() => {});
  }, [uid]);
  const close = () => closeModal();
  close.isModal = true;
  return (
    <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div class="row" style={{ alignItems: 'stretch', gap: 0, animation: 'pop .18s' }}>
        <ProfileCard uid={uid} serverId={serverId} onClose={close} />
        {uid !== S.me.id && (
          <div class="pcard" style={{ width: 300, marginLeft: 10, padding: 16, display: 'flex', flexDirection: 'column' }}>
            <SegBox style={{ marginBottom: 12 }}>
              <button class={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>Gemeinsame Server</button>
              <button class={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Freunde</button>
            </SegBox>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {!info && <div class="hint">Lade …</div>}
              {info && tab === 'info' && (info.mutualServers.length ? info.mutualServers.filter((id) => S.servers[id]).map((id) => (
                <button class="member" onClick={() => { closeModal(); navigate(id); }}>
                  <ServerIcon server={S.servers[id]} size={32} />
                  <span class="ellipsis">{S.servers[id].name}</span>
                </button>
              )) : <div class="hint">Keine gemeinsamen Server.</div>)}
              {info && tab === 'friends' && (info.mutualFriends.length ? info.mutualFriends.map((id) => (
                <button class="member" onClick={() => openModal('profile', { uid: id })}>
                  <Avatar uid={id} size={32} status />
                  <span class="ellipsis">{displayName(id)}</span>
                </button>
              )) : <div class="hint">Keine gemeinsamen Freunde.</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Status-Auswahl ----------
export function StatusPopout({ close }) {
  const me = S.me;
  const set = (status) => {
    act('setStatus', { status });
    me.status = status;
    close();
  };
  return (
    <div class="menu" style={{ position: 'static', width: 280 }}>
      <div class="row" style={{ padding: '8px 10px 10px' }}>
        <Avatar uid={me.id} size={44} status />
        <div class="grow" style={{ minWidth: 0 }}>
          <b class="ellipsis" style={{ display: 'block' }}>{me.displayName}</b>
          <span class="muted" style={{ fontSize: 12.5 }}>@{me.username}</span>
        </div>
      </div>
      <div class="menu-sep" />
      {['online', 'idle', 'dnd', 'invisible'].map((s) => (
        <button class="menu-item" onClick={() => set(s)}>
          <StatusDot status={s === 'invisible' ? 'offline' : s} />
          <span class="grow">{STATUS_LABEL[s]}</span>
          {me.status === s && <Icon name="check" />}
        </button>
      ))}
      <div class="menu-sep" />
      <button class="menu-item" onClick={() => { close(); openModal('customStatus'); }}>
        <span>{me.customStatus?.emoji ? <EmojiView e={me.customStatus.emoji} size={16} /> : '💬'}</span>
        <span class="grow ellipsis">{me.customStatus?.text || me.customStatus?.emoji ? me.customStatus.text || 'Status' : 'Eigenen Status festlegen'}</span>
      </button>
      <button class="menu-item" onClick={() => { close(); openModal('activity'); }}>
        <span>🎮</span>
        <span class="grow">{S.activities[me.id] ? `${S.activities[me.id].type} ${S.activities[me.id].name}` : 'Aktivität anzeigen'}</span>
      </button>
      <div class="menu-sep" />
      <button class="menu-item" onClick={(e) => withTransition(toggleGlass, e)}>
        <span>💧</span>
        <span class="grow">Liquid Glass</span>
        <span class={`switch sm ${prefs.glass ? 'on' : ''}`} />
      </button>
      <div class="menu-sep" />
      <button class="menu-item" onClick={() => { close(); S.settings = { tab: 'account' }; update(); }}>
        Einstellungen
      </button>
      <button class="menu-item" onClick={() => { close(); openModal('profile', { uid: me.id }); }}>
        Mein Profil ansehen
      </button>
      <button class="menu-item" onClick={() => { close(); S.settings = { tab: 'profile' }; update(); }}>
        Profil bearbeiten
      </button>
      <button class="menu-item" onClick={() => copy(me.username, 'Benutzername kopiert')}>
        Benutzernamen kopieren
      </button>
      <div class="menu-sep" />
      <button class="menu-item danger" onClick={async () => { close(); if (await confirmDialog('Abmelden', 'Willst du dich wirklich abmelden?', { ok: 'Abmelden' })) logout(); }}>
        Abmelden
      </button>
    </div>
  );
}

export function CustomStatusModal() {
  const cs = S.me.customStatus || {};
  const [text, setText] = useState(cs.text || '');
  const [emoji, setEmoji] = useState(cs.emoji || '');
  const [clear, setClear] = useState('never');
  const [picker, setPicker] = useState(false);
  const save = () => {
    const ms = { never: 0, '30m': 30 * 6e4, '1h': 36e5, '4h': 4 * 36e5, today: new Date().setHours(23, 59, 59) - Date.now() }[clear];
    act('setStatus', { customStatus: text || emoji ? { text, emoji, expires: ms ? Date.now() + ms : null } : null });
    if (ms) setTimeout(() => S.me.customStatus?.text === text && act('setStatus', { customStatus: null }), ms);
    closeModal();
  };
  return (
    <Modal
      title="Eigenen Status festlegen"
      footer={
        <>
          <button class="btn ghost" onClick={() => { act('setStatus', { customStatus: null }); closeModal(); }}>Löschen</button>
          <button class="btn" onClick={save}>Speichern</button>
        </>
      }
    >
      <div class="field">
        <label>Was ist los?</label>
        <div class="row" style={{ position: 'relative' }}>
          <button class="ibtn" style={{ fontSize: 20, background: 'var(--bg2)' }} onClick={() => setPicker(!picker)}>
            {emoji ? <EmojiView e={emoji} size={22} /> : '😀'}
          </button>
          <input class="input" maxLength={128} value={text} onInput={(e) => setText(e.target.value)} placeholder="Zockt bis 3 Uhr morgens" autoFocus />
          {picker && (
            <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 5 }}>
              <EmojiPicker onPick={(e) => { setEmoji(e); setPicker(false); }} />
            </div>
          )}
        </div>
      </div>
      <div class="field">
        <label>Zurücksetzen nach</label>
        <select class="select" value={clear} onChange={(e) => setClear(e.target.value)}>
          <option value="never">Nicht zurücksetzen</option>
          <option value="30m">30 Minuten</option>
          <option value="1h">1 Stunde</option>
          <option value="4h">4 Stunden</option>
          <option value="today">Heute</option>
        </select>
      </div>
    </Modal>
  );
}

export function ActivityModal() {
  const cur = S.activities[S.me.id];
  const [type, setType] = useState(cur?.type || 'Spielt');
  const [name, setName] = useState(cur?.name || '');
  return (
    <Modal
      title="Aktivität anzeigen"
      sub="Zeig deinen Freunden, was du gerade machst."
      footer={
        <>
          <button class="btn ghost" onClick={() => { act('setActivity', { activity: null }); closeModal(); }}>Entfernen</button>
          <button class="btn" disabled={!name.trim()} onClick={() => { act('setActivity', { activity: { type, name } }); closeModal(); }}>Anzeigen</button>
        </>
      }
    >
      <div class="field">
        <label>Art</label>
        <select class="select" value={type} onChange={(e) => setType(e.target.value)}>
          {['Spielt', 'Hört', 'Schaut', 'Streamt', 'Arbeitet an', 'Lernt'].map((t) => <option>{t}</option>)}
        </select>
      </div>
      <div class="field">
        <label>Was?</label>
        <input class="input" value={name} onInput={(e) => setName(e.target.value)} placeholder="z. B. Minecraft" autoFocus />
      </div>
    </Modal>
  );
}
