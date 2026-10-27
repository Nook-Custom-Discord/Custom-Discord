import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { S, update, prefs, setPref, useStore, openModal, toast } from './store';
import { auth, connect, normServer, isElectron, navigate, channelTitle, serverIdOf, can, P, rpc, act, sortedChannels, displayName, voiceMembers, openDM, dmList } from './api';
import { V } from './voice';
import { TopBar, HomeSidebar, ServerSidebar, MemberList } from './sidebar';
import { ChatView, SidePanel, runSearch } from './chat';
import { FriendsView } from './friends';
import { VoiceStage, IncomingCall, SoundboardPopout } from './voiceui';
import { ModalHost } from './modals';
import { SettingsView } from './settings';
import { ServerSettingsView } from './serversettings';
import { ProfileCard, StatusPopout } from './profile';
import { EmojiPicker } from './picker';
import { ContextMenu, Toasts, TooltipLayer, Positioned, Avatar, ChannelIcon, Spinner, fmtDateTime } from './ui';
import { Icon, LogoMark } from './icons';
import { Md } from './message';

// ---------- Login ----------
function Login() {
  const [mode, setMode] = useState('login');
  const [server, setServer] = useState(S.serverUrl || (isElectron ? 'http://localhost:3500' : location.origin));
  const [username, setUsername] = useState('');
  const [displayName0, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [check, setCheck] = useState(0);

  useEffect(() => {
    setInfo(null);
    const url = normServer(server);
    if (!url) return;
    const t = setTimeout(() => {
      fetch(url + '/api/info').then((r) => r.json()).then(setInfo).catch(() => setInfo(false));
    }, 400);
    return () => clearTimeout(t);
  }, [server, check]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await auth(server, mode, mode === 'register' ? { username, password, displayName: displayName0 || username, code } : { username, password });
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  };

  const hostHere = async () => {
    setHostBusy(true);
    const r = await window.nook.host.start(3500);
    setHostBusy(false);
    if (r.error) return setErr(r.error);
    setServer('http://localhost:' + r.port);
    setCheck((c) => c + 1);
    setErr('');
    setMode('register');
    toast('Server läuft auf deinem PC! Erstelle jetzt dein Konto.', 'success', 5000);
  };

  return (
    <div class="login">
      <div class="art">
        <div class="blob" style={{ width: 240, height: 240, top: 80, left: 70, background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }} />
        <div class="blob" style={{ width: 160, height: 160, top: 220, right: 90, background: 'rgba(76,195,255,.35)', animationDelay: '-4s' }} />
        <div class="blob" style={{ width: 90, height: 90, top: 60, right: 220, background: 'rgba(245,197,66,.4)', animationDelay: '-7s' }} />
        <div style={{ position: 'relative' }}>
          <div class="logo-mark" style={{ width: 56, height: 56, borderRadius: 18, marginBottom: 22 }}>
            <LogoMark size={32} />
          </div>
          <h1>Nook.</h1>
          <p>Euer privater Treffpunkt. Chatten, quatschen, zocken, streamen – nur ihr, auf eurem eigenen Server. Alles gratis, alles freigeschaltet.</p>
        </div>
      </div>
      <div class="form">
        <form class="box" onSubmit={submit}>
          <div class="tabs">
            <button type="button" class={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Anmelden</button>
            <button type="button" class={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Registrieren</button>
          </div>
          <div class="field">
            <label>Server-Adresse</label>
            <input class="input" value={server} onInput={(e) => setServer(e.target.value)} placeholder="z. B. 84.123.45.67:3500" />
            <div class="hint">
              {info === null ? 'Prüfe …' : info === false ? <span class="err">{isElectron && /localhost|127\.0\.0\.1/.test(server) ? 'Auf diesem PC läuft noch kein Server – klicke unten auf „Server auf diesem PC starten" (oder trag die Adresse deines Hosts ein).' : 'Kein Nook-Server unter dieser Adresse erreichbar'}</span> : <span style={{ color: 'var(--ok)' }}>✓ Nook-Server gefunden · {info.users} Mitglieder</span>}
            </div>
          </div>
          {mode === 'register' && (
            <div class="field">
              <label>Anzeigename</label>
              <input class="input" value={displayName0} onInput={(e) => setDisplayName(e.target.value)} placeholder="So sehen dich andere" maxLength={32} />
            </div>
          )}
          <div class="field">
            <label>Benutzername</label>
            <input class="input" value={username} onInput={(e) => setUsername(e.target.value.toLowerCase())} autoFocus autocomplete="username" />
          </div>
          <div class="field">
            <label>Passwort</label>
            <input class="input" type="password" value={password} onInput={(e) => setPassword(e.target.value)} autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          {mode === 'register' && info?.inviteOnly && (
            <div class="field">
              <label>Registrierungscode</label>
              <input class="input" value={code} onInput={(e) => setCode(e.target.value)} placeholder="Vom Server-Admin" />
            </div>
          )}
          {err && <div class="err" style={{ marginBottom: 12 }}>{err}</div>}
          <button class="btn" style={{ width: '100%', height: 46 }} disabled={busy || !username || !password}>
            {busy ? <Spinner /> : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
          </button>
          {isElectron && (
            <div class="card" style={{ marginTop: 22, padding: 14 }}>
              <b style={{ fontSize: 14 }}>Noch kein Server?</b>
              <div class="hint" style={{ margin: '4px 0 10px' }}>Einer aus eurer Gruppe startet den Server einfach auf seinem PC. Die anderen tragen dann seine Adresse ein.</div>
              <button type="button" class="btn ghost sm" onClick={hostHere} disabled={hostBusy}>
                <Icon name="server" /> {hostBusy ? 'Starte …' : 'Server auf diesem PC starten'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ---------- Kanal-Header ----------
function ChannelHeader({ ch }) {
  const serverId = serverIdOf(ch);
  const [q, setQ] = useState('');
  const isDM = ch.type === 'dm' || ch.type === 'group';
  const other = ch.type === 'dm' ? ch.recipients.find((r) => r !== S.me.id) : null;
  const inCall = V.channelId === ch.id;
  const panel = S.panel;
  const togglePanel = (key, value) => {
    S.panel = panel?.[key] === value ? null : { [key]: value };
    update();
  };
  return (
    <div class="chead">
      <button class="ibtn mobile-only" onClick={() => { S.mobileNav = 'nav'; update(); }}>
          <Icon name="chevronRight" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div class="title">
        {ch.type === 'dm' ? <Avatar uid={other} size={28} status /> : ch.type === 'group' ? <Icon name="users" size={20} /> : <ChannelIcon ch={ch} size={20} />}
        <span class="ellipsis" style={{ maxWidth: 320 }}>{channelTitle(ch)}</span>
      </div>
      {ch.topic && (
        <div class="topic ellipsis" onClick={() => openModal('confirm', { title: '#' + ch.name, text: <Md text={ch.topic} serverId={serverId} />, ok: 'OK', danger: false, resolve: () => {} })}>
          {ch.topic}
        </div>
      )}
      {other && S.users[other]?.customStatus?.text && <div class="topic ellipsis">{S.users[other].customStatus.text}</div>}
      <div class="tools">
        {isDM && !inCall && (
          <>
            <button class="ibtn" data-tip="Sprachanruf starten" onClick={() => V.join(ch.id)}>
              <Icon name="phone" />
            </button>
            <button class="ibtn" data-tip="Videoanruf starten" onClick={async () => { await V.join(ch.id); V.toggleCamera(); }}>
              <Icon name="video" />
            </button>
          </>
        )}
        {inCall && isDM && voiceMembers(ch.id).length === 1 && (
          <button class="btn ghost sm" onClick={() => act('ringAgain', { channelId: ch.id }, 'Klingelt erneut …')}>Erneut klingeln</button>
        )}
        {isDM && (
          <button class="ibtn" data-tip={ch.type === 'dm' ? 'Freunde zur DM hinzufügen' : 'Freunde zur Gruppe hinzufügen'} onClick={() => openModal('createGroup', { channelId: ch.id })}>
            <Icon name="userPlus" />
          </button>
        )}
        {ch.type === 'group' && (
          <button class="ibtn" data-tip="Gruppeneinstellungen" onClick={() => openModal('groupSettings', { channelId: ch.id })}>
            <Icon name="gear" />
          </button>
        )}
        {serverId && (ch.type === 'text' || ch.type === 'announce') && (
          <button class={`ibtn ${panel?.threads ? 'on' : ''}`} data-tip="Threads" onClick={() => togglePanel('threads', ch.id)}>
            <Icon name="thread" />
          </button>
        )}
        <button class={`ibtn ${panel?.pins ? 'on' : ''}`} data-tip="Angeheftete Nachrichten" onClick={() => togglePanel('pins', ch.id)}>
          <Icon name="pin" />
        </button>
        <button class={`ibtn ${prefs.mutedChannels[ch.id] ? 'on' : ''}`} data-tip={prefs.mutedChannels[ch.id] ? 'Stummschaltung aufheben' : 'Benachrichtigungen'} onClick={() => (serverId ? openModal('notif', { serverId, channelId: ch.id }) : (prefs.mutedChannels[ch.id] ? delete prefs.mutedChannels[ch.id] : (prefs.mutedChannels[ch.id] = true), setPref('mutedChannels', prefs.mutedChannels)))}>
          <Icon name={prefs.mutedChannels[ch.id] ? 'bellOff' : 'bell'} />
        </button>
        {(serverId || ch.type === 'group') && (
          <button class={`ibtn ${prefs.showMembers ? 'on' : ''}`} data-tip="Mitgliederliste" onClick={() => setPref('showMembers', !prefs.showMembers)}>
            <Icon name="users" />
          </button>
        )}
        <form class="search-box" onSubmit={(e) => { e.preventDefault(); if (q.trim()) runSearch(q, ch); }}>
          <Icon name="search" />
          <input placeholder={serverId ? 'Server durchsuchen' : 'Suchen'} value={q} onInput={(e) => setQ(e.target.value)} data-tip="Filter: from:benutzer  has:image|file|link" />
        </form>
      </div>
    </div>
  );
}


// ---------- Forum ----------
function ForumView({ ch }) {
  const serverId = serverIdOf(ch);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const posts = Object.values(S.channels)
    .filter((t) => t.type === 'thread' && t.parentId === ch.id)
    .sort((a, b) => ((b.lastMessageId || b.id) > (a.lastMessageId || a.id) ? 1 : -1));
  const create = async () => {
    if (!title.trim()) return;
    const th = await act('createThread', { channelId: ch.id, name: title });
    S.channels[th.id] = th;
    if (body.trim()) await rpc('sendMessage', { channelId: th.id, content: body });
    setTitle('');
    setBody('');
    setOpen(false);
    navigate(serverId, ch.id, th.id);
  };
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
      {ch.topic && <div class="card"><Md text={ch.topic} serverId={serverId} /></div>}
      {open ? (
        <div class="card">
          <input class="input" placeholder="Titel" value={title} onInput={(e) => setTitle(e.target.value)} style={{ marginBottom: 8, fontWeight: 800 }} autoFocus />
          <textarea class="textarea" placeholder="Worum geht's?" value={body} onInput={(e) => setBody(e.target.value)} />
          <div class="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button class="btn ghost" onClick={() => setOpen(false)}>Abbrechen</button>
            <button class="btn" onClick={create}>Posten</button>
          </div>
        </div>
      ) : (
        <button class="btn" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>
          <Icon name="plus" /> Neuer Beitrag
        </button>
      )}
      {posts.map((t) => (
        <div class="forum-post" onClick={() => navigate(serverId, ch.id, t.id)}>
          <h4>{t.name}</h4>
          <div class="row muted" style={{ fontSize: 13 }}>
            <Avatar uid={t.ownerId} size={20} deco={false} />
            {displayName(t.ownerId, serverId)} · {t.messageCount || 0} Antworten · {fmtDateTime(t.createdAt)}
          </div>
        </div>
      ))}
      {!posts.length && !open && <div class="empty"><div class="art">🗂️</div>Noch keine Beiträge. Mach den Anfang!</div>}
    </div>
  );
}

// ---------- Inhalt ----------
function Content() {
  const { serverId, channelId } = S.view;
  const ch = channelId && S.channels[channelId];
  if (!ch) {
    if (serverId === '@me') return <div class="panel content"><FriendsView /></div>;
    return (
      <div class="panel content">
        <div class="empty" style={{ margin: 'auto' }}>
          <div class="art">🧭</div>
          <div>Wähle links einen Kanal.</div>
        </div>
      </div>
    );
  }
  if (ch.nsfw && !prefs.nsfwOk?.[ch.id] && !S.modals.some((m) => m.type === 'nsfw')) setTimeout(() => openModal('nsfw', { channelId: ch.id }));
  const isVoice = ch.type === 'voice' || ch.type === 'stage';
  const isDM = ch.type === 'dm' || ch.type === 'group';
  const callActive = isDM && (V.channelId === ch.id || voiceMembers(ch.id).length > 0);
  return (
    <div class="panel content">
      <ChannelHeader ch={ch} />
      <div class="chat-wrap">
        {isVoice ? (
          <VoiceStage ch={ch} />
        ) : ch.type === 'forum' ? (
          <ForumView ch={ch} />
        ) : callActive ? (
          <div class="chat dm-call" style={{ display: 'flex', flexDirection: 'column' }}>
            <VoiceStage ch={ch} />
            <ChatView ch={ch} />
          </div>
        ) : (
          <ChatView ch={ch} />
        )}
        <SidePanel />
      </div>
    </div>
  );
}

function Popouts() {
  const p = S.popout;
  if (!p) return null;
  const close = () => {
    S.popout = null;
    update();
  };
  let inner = null;
  let prefer = p.props?.prefer || 'right';
  if (p.type === 'profile') inner = <ProfileCard uid={p.props.uid} serverId={p.props.serverId} onClose={close} />;
  if (p.type === 'emoji') {
    inner = <EmojiPicker onPick={p.props.onPick} close={close} />;
    prefer = 'top';
  }
  if (p.type === 'status') inner = <StatusPopout close={close} />;
  if (p.type === 'soundboard') {
    inner = <SoundboardPopout close={close} />;
    prefer = 'top';
  }
  if (prefer === 'left') prefer = 'right';
  return (
    <Positioned rect={p.rect} prefer={prefer} onClose={close} key={p.rect.left + ':' + p.rect.top + p.type}>
      {inner}
    </Positioned>
  );
}

function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.style.setProperty('--accent', prefs.accent);
  const light = (() => {
    const c = prefs.accent.replace('#', '');
    const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  })();
  root.style.setProperty('--on-accent', light ? '#16100a' : '#fff');
  root.style.setProperty('--fs', 15 * prefs.fontScale + 'px');
  document.body.classList.toggle('compact', prefs.density === 'compact');
  document.body.classList.toggle('reduce-motion', prefs.reduceMotion);
  document.body.classList.add('platform-' + (window.nook?.platform || 'web'));
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  const fg = getComputedStyle(root).getPropertyValue('--text2').trim();
  if (window.nook && (applyTheme.last !== bg + fg)) {
    applyTheme.last = bg + fg;
    window.nook.setTitleBar(bg.length === 4 ? '#000000' : bg, fg);
  }
}

function useHotkeys() {
  useEffect(() => {
    const k = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!S.modals.some((m) => m.type === 'quickSwitch')) openModal('quickSwitch');
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'm' && !window.nook?.globalHotkeys) {
        e.preventDefault();
        V.toggleMute();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'd' && !window.nook?.globalHotkeys) {
        e.preventDefault();
        V.toggleDeafen();
      } else if (mod && e.key === ',') {
        e.preventDefault();
        S.settings = { tab: 'account' };
        update();
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const sid = S.view.serverId;
        const list = sid === '@me' ? dmList() : sortedChannels(sid).filter((c) => c.type !== 'voice');
        const i = list.findIndex((c) => c.id === S.view.channelId);
        const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
        if (next) navigate(sid, next.id);
      } else if (!mod && !e.altKey && e.key.length === 1 && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !S.modals.length && !S.settings) {
        document.querySelector('.composer textarea')?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}

function App() {
  useStore();
  useHotkeys();
  applyTheme();
  if (!S.token) return <><Login /><Toasts /></>;
  if (!S.me)
    return (
      <div class="splash">
        <div class="logo-mark" style={{ width: 64, height: 64, borderRadius: 20, animation: 'pulse 1.4s infinite' }}>
          <LogoMark size={36} />
        </div>
        <div>{S.conn === 'reconnecting' ? `Server ${S.serverUrl} nicht erreichbar – versuche erneut …` : 'Verbinde …'}</div>
        {S.conn === 'reconnecting' && (
          <button class="btn ghost sm" onClick={() => { localStorage.removeItem('nook.token'); location.reload(); }}>
            Anderen Server wählen
          </button>
        )}
      </div>
    );
  const { serverId, channelId } = S.view;
  const ch = channelId && S.channels[channelId];
  const showMembers = prefs.showMembers && ch && ((serverId !== '@me' && ch.type !== 'voice' && ch.type !== 'stage') || ch.type === 'group') && !S.panel;
  return (
    <div class="app">
      <TopBar />
      <div class={`main mnav-${S.mobileNav || 'nav'}`} style={{ gridTemplateColumns: showMembers ? '280px minmax(0,1fr) 260px' : '280px minmax(0,1fr)' }}>
        {serverId === '@me' ? <HomeSidebar /> : <ServerSidebar serverId={serverId} />}
        <Content />
        {showMembers && <MemberList serverId={serverId !== '@me' ? serverId : null} ch={ch} />}
      </div>
      {S.conn !== 'ready' && <div class="conn-banner">Verbindung verloren – verbinde neu …</div>}
      {S.uiUpdate && S.uiUpdate !== window.__NOOK_UI_V && S.conn === 'ready' && (
        <div class="update-banner">
          ✨ Neue Nook-Version verfügbar
          <button class="btn sm ghost" onClick={() => { try { sessionStorage.removeItem('nook.uiReload'); } catch {} location.reload(); }}>
            Jetzt neu laden
          </button>
        </div>
      )}
      {S.settings && <SettingsView />}
      {S.serverSettings && <ServerSettingsView />}
      <Popouts />
      <ModalHost />
      <IncomingCall />
      <ContextMenu />
      <Toasts />
      <TooltipLayer />
    </div>
  );
}

window.__nook = { S, V };
(() => {
  let timer = null;
  let start = null;
  let nativeFired = false;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, target: e.target };
    nativeFired = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (nativeFired || !start) return;
      start.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y }));
      navigator.vibrate?.(15);
    }, 600);
  }, { passive: true });
  const cancel = () => { clearTimeout(timer); start = null; };
  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
  }, { passive: true });
  document.addEventListener('touchend', cancel);
  document.addEventListener('contextmenu', (e) => { if (e.isTrusted) nativeFired = true; }, true);
})();
// Service Worker für die installierbare Handy-App (nur Web-Version)
if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('fullscreenchange', () => update());
// Globale Tastenkürzel (funktionieren auch, wenn Nook im Hintergrund ist)
window.nook?.on?.('hotkey', (k) => {
  if (k === 'mute') V.toggleMute();
  if (k === 'deafen') V.toggleDeafen();
});
if (S.token && S.serverUrl) connect();
render(<App />, document.getElementById('root'));
