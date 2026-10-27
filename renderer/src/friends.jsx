import { useState } from 'preact/hooks';
import { S, update, openModal, confirmDialog, toast } from './store';
import { act, openDM, displayName, voiceMembers, channelTitle, navigate, serverIdOf } from './api';
import { Avatar, STATUS_LABEL, Name } from './ui';
import { Icon } from './icons';
import { V } from './voice';
import { memberMenu } from './sidebar';
import { EmojiView } from './picker';

function AddFriend() {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await act('friendRequest', { username: name.trim() });
      setMsg({ ok: true, text: `Freundschaftsanfrage an ${name.trim()} gesendet!` });
      setName('');
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };
  return (
    <div style={{ padding: '22px 4px' }}>
      <h2 style={{ margin: '0 0 6px' }}>Freund hinzufügen</h2>
      <div class="hint" style={{ marginBottom: 14 }}>Gib den Benutzernamen ein (ohne @). Deinen eigenen findest du oben rechts: <b>@{S.me.username}</b></div>
      <form onSubmit={submit} class="row" style={{ background: 'var(--bg2)', border: '1px solid var(--line2)', borderRadius: 16, padding: 6, paddingLeft: 14 }}>
        <input class="grow" style={{ background: 'none', border: 0, outline: 'none', height: 40 }} placeholder="z. B. max_mustermann" value={name} onInput={(e) => { setName(e.target.value); setMsg(null); }} autoFocus />
        <button class="btn" disabled={!name.trim()}>
          Anfrage senden
        </button>
      </form>
      {msg && <div style={{ marginTop: 10, color: msg.ok ? 'var(--ok)' : 'var(--danger)', fontSize: 14 }}>{msg.text}</div>}
      <div class="card" style={{ marginTop: 28 }}>
        <b>So kommen deine Freunde dazu</b>
        <ol class="hint" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>Sie laden Nook herunter und starten es.</li>
          <li>Beim Login tragen sie dieselbe Server-Adresse ein wie du: <b style={{ color: 'var(--text)' }}>{S.serverUrl}</b></li>
          <li>Sie registrieren sich und schicken dir eine Anfrage an <b style={{ color: 'var(--text)' }}>@{S.me.username}</b> – fertig.</li>
        </ol>
      </div>
    </div>
  );
}

function FriendRow({ uid, type }) {
  const u = S.users[uid];
  if (!u) return null;
  const act0 = S.activities[uid];
  const status = type === 'incoming' ? 'Eingehende Anfrage' : type === 'outgoing' ? 'Ausgehende Anfrage' : type === 'blocked' ? 'Blockiert' : act0 ? `${act0.type || 'Spielt'} ${act0.name}` : u.customStatus?.text || STATUS_LABEL[u.status];
  return (
    <div class="frow" onClick={() => type === 'friend' && openDM(uid)} onContextMenu={(e) => memberMenu(e, uid, null)}>
      <Avatar uid={uid} size={40} status={type === 'friend'} />
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="n">
          <Name uid={uid} /> <span class="muted" style={{ fontWeight: 500, fontSize: 13 }}>@{u.username}</span>
        </div>
        <div class="s ellipsis">
          {type === 'friend' && u.customStatus?.emoji && <EmojiView e={u.customStatus.emoji} size={13} />} {status}
        </div>
      </div>
      <div class="acts" onClick={(e) => e.stopPropagation()}>
        {type === 'friend' && (
          <>
            <button class="ibtn" data-tip="Nachricht" onClick={() => openDM(uid)}>
              <Icon name="chat" />
            </button>
            <button class="ibtn" data-tip="Anrufen" onClick={async () => { const c = await openDM(uid); V.join(c.id); }}>
              <Icon name="phone" />
            </button>
            <button class="ibtn" data-tip="Mehr" onClick={(e) => memberMenu(e, uid, null)}>
              <Icon name="more" />
            </button>
          </>
        )}
        {type === 'incoming' && (
          <>
            <button class="ibtn" style={{ color: 'var(--ok)' }} data-tip="Annehmen" onClick={() => act('friendAccept', { userId: uid })}>
              <Icon name="check" />
            </button>
            <button class="ibtn red" data-tip="Ablehnen" onClick={() => act('friendRemove', { userId: uid })}>
              <Icon name="x" />
            </button>
          </>
        )}
        {type === 'outgoing' && (
          <button class="ibtn red" data-tip="Zurückziehen" onClick={() => act('friendRemove', { userId: uid })}>
            <Icon name="x" />
          </button>
        )}
        {type === 'blocked' && (
          <button class="btn ghost sm" onClick={() => act('unblock', { userId: uid })}>
            Entblocken
          </button>
        )}
      </div>
    </div>
  );
}

function ActiveNow() {
  const friends = Object.entries(S.rel).filter(([, t]) => t === 'friend').map(([id]) => id);
  const cards = [];
  const seen = new Set();
  for (const id of friends) {
    const vs = S.voice[id];
    if (vs && !seen.has(vs.channelId)) {
      seen.add(vs.channelId);
      const ch = S.channels[vs.channelId];
      if (!ch) continue;
      const members = voiceMembers(ch.id);
      cards.push(
        <div class="an-card">
          <div class="row">
            <Avatar uid={id} size={34} status />
            <div class="grow" style={{ minWidth: 0 }}>
              <b class="ellipsis" style={{ display: 'block' }}>{displayName(id)}</b>
              <div class="muted ellipsis" style={{ fontSize: 12.5 }}>{ch.serverId ? S.servers[ch.serverId]?.name : 'Anruf'}</div>
            </div>
          </div>
          <div class="row" style={{ marginTop: 10, background: 'var(--bg2)', borderRadius: 12, padding: 10 }}>
            <Icon name="speaker" size={18} />
            <span class="grow ellipsis">{channelTitle(ch)}</span>
            <div class="row" style={{ gap: 0 }}>
              {members.slice(0, 4).map((m) => (
                <div style={{ marginLeft: -6 }}>
                  <Avatar uid={m.uid} size={22} round deco={false} />
                </div>
              ))}
            </div>
          </div>
          {members.some((m) => m.screenStreamId) && <div style={{ marginTop: 8 }}><span class="live">LIVE</span> <span class="muted" style={{ fontSize: 12.5 }}>Jemand streamt gerade</span></div>}
          <button class="btn ghost sm" style={{ width: '100%', marginTop: 10 }} onClick={() => { navigate(serverIdOf(ch) || '@me', ch.id); V.join(ch.id); }}>
            Beitreten
          </button>
        </div>
      );
    } else if (S.activities[id] && !vs) {
      const a = S.activities[id];
      cards.push(
        <div class="an-card">
          <div class="row">
            <Avatar uid={id} size={34} status />
            <div class="grow" style={{ minWidth: 0 }}>
              <b>{displayName(id)}</b>
              <div class="muted ellipsis" style={{ fontSize: 12.5 }}>
                {a.type || 'Spielt'} {a.name}
              </div>
            </div>
            <span style={{ fontSize: 22 }}>🎮</span>
          </div>
        </div>
      );
    }
  }
  return (
    <div class="active-now">
      <h3>Gerade aktiv</h3>
      {cards.length ? (
        cards
      ) : (
        <div class="an-empty">
          <div class="an-empty-art">🌙</div>
          <b>Gerade ist es ruhig …</b>
          <div class="hint">Wenn Freunde in einem Sprachkanal sind oder etwas spielen, siehst du das hier.</div>
        </div>
      )}
    </div>
  );
}

export function FriendsView() {
  const tab = S.view.homeTab || 'online';
  const setTab = (t) => {
    S.view.homeTab = t;
    update();
  };
  const all = Object.entries(S.rel);
  const friends = all.filter(([, t]) => t === 'friend').map(([id]) => id);
  const pending = all.filter(([, t]) => t === 'incoming' || t === 'outgoing');
  const blocked = all.filter(([, t]) => t === 'blocked').map(([id]) => id);
  const online = friends.filter((id) => S.users[id]?.status !== 'offline');
  const [q, setQ] = useState('');
  const filter = (ids) => ids.filter((id) => !q || displayName(id).toLowerCase().includes(q.toLowerCase()) || S.users[id]?.username.includes(q.toLowerCase()));
  const sortName = (a, b) => displayName(a).localeCompare(displayName(b));
  let content;
  if (tab === 'add') content = <AddFriend />;
  else {
    let rows;
    let label;
    if (tab === 'online') {
      rows = filter(online).sort(sortName).map((id) => <FriendRow uid={id} type="friend" />);
      label = `Online — ${online.length}`;
    } else if (tab === 'all') {
      rows = filter(friends).sort(sortName).map((id) => <FriendRow uid={id} type="friend" />);
      label = `Alle Freunde — ${friends.length}`;
    } else if (tab === 'pending') {
      rows = pending.filter(([id]) => filter([id]).length).map(([id, t]) => <FriendRow uid={id} type={t} />);
      label = `Ausstehend — ${pending.length}`;
    } else {
      rows = filter(blocked).map((id) => <FriendRow uid={id} type="blocked" />);
      label = `Blockiert — ${blocked.length}`;
    }
    content = (
      <>
        <input class="input" placeholder="Suchen" value={q} onInput={(e) => setQ(e.target.value)} style={{ marginBottom: 14, borderRadius: 99 }} />
        <div class="label" style={{ marginBottom: 8 }}>{label}</div>
        {rows.length ? (
          rows
        ) : (
          <div class="empty">
            <div class="art">{tab === 'pending' ? '📭' : tab === 'blocked' ? '🛡️' : '🌙'}</div>
            <div>{tab === 'online' ? 'Gerade ist niemand online.' : tab === 'pending' ? 'Keine offenen Anfragen.' : tab === 'blocked' ? 'Du hast niemanden blockiert.' : 'Noch keine Freunde – füge welche hinzu!'}</div>
            {(tab === 'all' || tab === 'online') && <button class="btn" onClick={() => setTab('add')}>Freund hinzufügen</button>}
          </div>
        )}
      </>
    );
  }
  const incoming = pending.filter(([, t]) => t === 'incoming').length;
  return (
    <>
      <div class="chead">
        <button class="ibtn mobile-only" onClick={() => { S.mobileNav = 'nav'; update(); }}>
            <Icon name="chevronRight" style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div class="title">
          <Icon name="users" size={20} /> Freunde
        </div>
        <div class="friends-tabs">
          <button class={`ftab ${tab === 'online' ? 'active' : ''}`} onClick={() => setTab('online')}>Online</button>
          <button class={`ftab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>Alle</button>
          <button class={`ftab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
            Ausstehend {incoming > 0 && <span class="badge">{incoming}</span>}
          </button>
          <button class={`ftab ${tab === 'blocked' ? 'active' : ''}`} onClick={() => setTab('blocked')}>Blockiert</button>
          <button class={`ftab add ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>Freund hinzufügen</button>
        </div>
        <div class="tools">
          <button class="ibtn" data-tip="Neue Gruppe" onClick={() => openModal('createGroup')}>
            <Icon name="plus" />
          </button>
        </div>
      </div>
      <div class="friends-body">
        <div class="flist">{content}</div>
        <ActiveNow />
      </div>
    </>
  );
}
