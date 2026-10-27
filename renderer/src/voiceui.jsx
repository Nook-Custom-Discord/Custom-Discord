import { useState, useEffect, useRef } from 'preact/hooks';
import { S, update, prefs, setPref, openModal, closeModal, openPopout, openMenu, toast } from './store';
import { act, rpc, displayName, channelTitle, serverIdOf, voiceMembers, can, P, navigate, dismissCall, avatarOf, isVideoUrl, openDM, isElectron } from './api';
import { V, QUALITY } from './voice';
import { Avatar, Modal, Seg, Video, Name, Spinner, ServerIcon } from './ui';
import { Icon } from './icons';
import { ChatView } from './chat';
import { SoundboardPicker } from './picker';

// ---------- Teilnehmer-Menü ----------
export function voiceUserMenu(e, uid, serverId) {
  const vs = S.voice[uid];
  const me = uid === S.me.id;
  const modMute = serverId && can(serverId, P.MUTE_MEMBERS);
  const modMove = serverId && can(serverId, P.MOVE_MEMBERS);
  const voiceChans = serverId ? Object.values(S.channels).filter((c) => c.serverId === serverId && (c.type === 'voice' || c.type === 'stage') && c.id !== vs?.channelId) : [];
  openMenu(e, [
    { label: 'Profil', icon: 'users', onClick: () => openModal('profile', { uid, serverId }) },
    !me && { label: 'Nachricht', icon: 'chat', onClick: () => openDM(uid) },
    !me && V.channelId && vs?.channelId === V.channelId && {
      render: () => (
        <div>
          <div class="row" style={{ marginBottom: 4 }}>
            <span class="grow">Lautstärke</span>
            <b>{Math.round((prefs.userVolumes[uid] ?? 1) * 100)}%</b>
          </div>
          <input type="range" min="0" max="2" step="0.05" value={prefs.userVolumes[uid] ?? 1} onInput={(ev) => V.setUserVolume(uid, +ev.target.value)} />
        </div>
      ),
    },
    !me && { label: 'Für mich stummschalten', checked: !!prefs.localMutes[uid], keep: true, onClick: () => V.toggleLocalMute(uid) },
    '-',
    modMute && vs && { label: 'Server-Mute', checked: !!vs.serverMuted, onClick: () => act('voiceModerate', { userId: uid, serverMuted: !vs.serverMuted }) },
    modMute && vs && { label: 'Server-Taub', checked: !!vs.serverDeafened, onClick: () => act('voiceModerate', { userId: uid, serverDeafened: !vs.serverDeafened }) },
    modMove && vs && voiceChans.length && '-',
    ...(modMove && vs ? voiceChans.map((c) => ({ label: 'Verschieben nach: ' + c.name, onClick: () => act('voiceModerate', { userId: uid, moveTo: c.id }) })) : []),
    modMove && vs && !me && { label: 'Trennen', danger: true, onClick: () => act('voiceModerate', { userId: uid, disconnect: true }) },
  ]);
}

// ---------- Vollbild ----------
// Das ganze Fenster geht in Vollbild und der Call füllt es aus (CSS-Klasse call-fs).
// So bleiben alle Menüs (Bildschirm teilen, Soundboard, Rechtsklick …) bedienbar.
export function exitCallFullscreen() {
  if (!S.callFs) return;
  S.callFs = false;
  document.body.classList.remove('call-fs');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  update();
}
export function toggleFullscreen(el) {
  if (S.callFs) return exitCallFullscreen();
  const uid = el?.dataset?.uid;
  if (uid) V.focus = { uid, kind: el.dataset.kind || 'user' };
  S.callFs = true;
  document.body.classList.add('call-fs');
  document.documentElement.requestFullscreen?.().catch(() => {});
  update();
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && S.callFs) exitCallFullscreen();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.callFs && !S.modals.length && !S.menu && !S.popout) exitCallFullscreen();
});
function pip(tileEl) {
  const v = tileEl?.querySelector('video');
  if (!v) return;
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  else v.requestPictureInPicture?.().catch(() => {});
}
function TileTools({ children, hasVideo }) {
  return (
    <div class="ttools always" onClick={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()}>
      {children}
      {hasVideo && document.pictureInPictureEnabled && (
        <button class="ibtn sm" data-tip="Bild-in-Bild" onClick={(e) => pip(e.currentTarget.closest('.tile'))}>
          <Icon name="screen" />
        </button>
      )}
      <button class="ibtn sm" data-tip="Vollbild (Doppelklick)" onClick={(e) => toggleFullscreen(e.currentTarget.closest('.tile'))}>
        <Icon name={S.callFs ? 'minimize' : 'maximize'} />
      </button>
    </div>
  );
}

// ---------- Kachel ----------
// unscharfer Kachel-Hintergrund aus dem Avatar; Video-Avatare taugen nicht als Hintergrundbild -> Akzentfarbe
function tileBg(uid, serverId) {
  const av = avatarOf(uid, serverId);
  return av && !isVideoUrl(av) ? { backgroundImage: `url(${av})` } : { backgroundColor: S.users[uid]?.accent || 'var(--panel3)' };
}

function Tile({ uid, kind = 'user', serverId, small, onClick }) {
  const vs = S.voice[uid] || {};
  const me = uid === S.me.id;
  const speaking = V.speaking.has(uid);
  const fx = V.soundFx.filter((f) => f.userId === uid);
  if (kind === 'screen') {
    const stream = me ? V.screenStream : V.remote[uid]?.screen;
    const watching = me || V.watching.has(uid);
    // echte Werte beim Zuschauer; Farbe zeigt, ob die FPS das Ziel des Streamers erreichen
    const st = !me && watching && V.screenStats[uid]?.h ? V.screenStats[uid] : null;
    const health = st && vs.screenInfo?.fps ? (st.fps >= vs.screenInfo.fps * 0.8 ? 'good' : st.fps >= vs.screenInfo.fps * 0.45 ? 'ok' : 'bad') : '';
    return (
      <div class="tile" data-uid={uid} data-kind="screen" onClick={onClick} onContextMenu={(e) => voiceUserMenu(e, uid, serverId)} onDblClick={(e) => toggleFullscreen(e.currentTarget)}>
        {watching && stream ? (
          <Video stream={stream} />
        ) : (
          <>
            <div class="tbg" style={tileBg(uid, serverId)} />
            <div class="watch">
              <span class="live">LIVE</span>
              <b>{displayName(uid, serverId)} streamt</b>
              {vs.screenInfo && <span style={{ fontSize: 12, opacity: 0.8 }}>{vs.screenInfo.label}</span>}
              {!me &&
                (watching ? (
                  <Spinner />
                ) : (
                  <button class="btn" onClick={(e) => { e.stopPropagation(); V.watch(uid); }}>
                    <Icon name="eye" /> Stream ansehen
                  </button>
                ))}
            </div>
          </>
        )}
        <div class="tname">
          <span class="live">LIVE</span> {displayName(uid, serverId)}
          {st ? (
            <span class={`sstat ${health}`} data-tip="Empfangene Qualität">
              {st.h}p · {st.fps} FPS · {(st.kbps / 1000).toFixed(1)} Mbit/s
            </span>
          ) : (
            vs.screenInfo && watching && <span style={{ opacity: 0.7, fontWeight: 600 }}>· {vs.screenInfo.width ? `${vs.screenInfo.height}p` : ''}{vs.screenInfo.fps}</span>
          )}
        </div>
        <TileTools hasVideo={watching && !!stream}>
          {!me && watching && vs.screenInfo?.audio && (
            <button class="ibtn sm" data-tip="Stream-Lautstärke" onClick={(e) => openMenu(e, [{ render: () => (<div><div>Stream-Lautstärke</div><input type="range" min="0" max="2" step="0.05" value={prefs.streamVolumes[uid] ?? 1} onInput={(ev) => V.setStreamVolume(uid, +ev.target.value)} /></div>) }])}>
              <Icon name="volume" />
            </button>
          )}
          {!me && watching && (
            <button class="ibtn sm" data-tip="Nicht mehr ansehen" onClick={() => V.unwatch(uid)}>
              <Icon name="x" />
            </button>
          )}
        </TileTools>
      </div>
    );
  }
  const cam = me ? V.camStream : V.remote[uid]?.camera;
  const showCam = vs.video && cam;
  return (
    <div class={`tile ${speaking ? 'speaking' : ''}`} data-uid={uid} data-kind="user" onClick={onClick} onContextMenu={(e) => voiceUserMenu(e, uid, serverId)} onDblClick={(e) => toggleFullscreen(e.currentTarget)}>
      {showCam ? (
        <Video stream={cam} mirror={me} cover={!small} />
      ) : (
        <>
          <div class="tbg" style={tileBg(uid, serverId)} />
          <div class="tav">
            <Avatar uid={uid} size={small ? 44 : 84} serverId={serverId} speaking={speaking} round />
          </div>
        </>
      )}
      <div class="tname">
        {(vs.muted || vs.serverMuted) && <Icon name="micOff" style={{ color: vs.serverMuted ? 'var(--danger)' : undefined }} />}
        {(vs.deafened || vs.serverDeafened) && <Icon name="headphonesOff" />}
        <span class="ellipsis">{displayName(uid, serverId)}</span>
        {prefs.localMutes[uid] && <Icon name="volume" style={{ color: 'var(--danger)' }} />}
      </div>
      {!small && <TileTools hasVideo={!!showCam} />}
      {fx.map((f) => (
        <span class="sfx" key={f.at}>
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

function gridCols(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

// ---------- Steuerleiste ----------
export function CallControls({ ch, compact }) {
  const serverId = serverIdOf(ch);
  const connected = V.channelId === ch.id;
  const vs = S.voice[S.me.id];
  if (!connected) return null;
  return (
    <div class="stage-bar">
      <button class={`round-btn ${V.muted ? 'off' : ''}`} data-tip={V.muted ? 'Stummschaltung aufheben' : 'Stummschalten'} onClick={() => V.toggleMute()}>
        <Icon name={V.muted ? 'micOff' : 'mic'} />
      </button>
      <button class={`round-btn ${V.deafened ? 'off' : ''}`} data-tip={V.deafened ? 'Ton an' : 'Ton aus'} onClick={() => V.toggleDeafen()}>
        <Icon name={V.deafened ? 'headphonesOff' : 'headphones'} />
      </button>
      <button class={`round-btn ${V.camStream ? 'on' : ''}`} data-tip={V.camStream ? 'Kamera aus' : 'Kamera an'} onClick={() => V.toggleCamera()}>
        <Icon name={V.camStream ? 'video' : 'videoOff'} />
      </button>
      <button class={`round-btn ${V.screenStream ? 'on' : ''}`} data-tip={V.screenStream ? 'Stream beenden' : 'Bildschirm teilen'} onClick={() => (V.screenStream ? V.stopScreen() : openModal('screenshare'))}>
        <Icon name={V.screenStream ? 'screenOff' : 'screen'} />
      </button>
      <button class="round-btn" data-tip="Soundboard" onClick={(e) => openPopout(e, 'soundboard', { prefer: 'top' })}>
        <Icon name="soundboard" />
      </button>
      {ch.type === 'stage' && vs?.suppressed && (
        <button class="round-btn" data-tip="Sprechen anfragen" onClick={() => act('requestToSpeak', {}, 'Anfrage gesendet')}>
          <Icon name="hand" />
        </button>
      )}
      <button class="round-btn" data-tip={S.callFs ? 'Vollbild beenden (Esc)' : 'Vollbild'} onClick={(e) => toggleFullscreen(e.currentTarget.closest('.stage'))}>
        <Icon name={S.callFs ? 'minimize' : 'maximize'} />
      </button>
      <button class="round-btn red" data-tip="Verlassen" onClick={() => V.leave()}>
        <Icon name="hangup" />
      </button>
    </div>
  );
}

// ---------- Voice-Ansicht ----------
export function VoiceStage({ ch }) {
  const serverId = serverIdOf(ch);
  const members = voiceMembers(ch.id);
  const connected = V.channelId === ch.id;
  const [showChat, setShowChat] = useState(false);

  if (!connected) {
    return (
      <div class="stage">
        <div class="voice-lobby">
          <div>
            <div style={{ fontSize: 42 }}>{ch.type === 'stage' ? '🎙️' : '🔊'}</div>
            <h2 style={{ margin: '10px 0 4px' }}>{channelTitle(ch)}</h2>
            <div class="muted">{members.length ? `${members.length} ${members.length === 1 ? 'Person ist' : 'Leute sind'} gerade hier` : 'Noch niemand da – starte die Runde!'}</div>
            {members.length > 0 && (
              <div class="who">
                {members.slice(0, 8).map((m) => (
                  <Avatar uid={m.uid} size={46} serverId={serverId} round />
                ))}
              </div>
            )}
            <button class="btn" style={{ marginTop: 16, height: 44, padding: '0 26px' }} onClick={() => V.join(ch.id)} disabled={V.joining}>
              {V.joining ? <Spinner /> : <Icon name={ch.type === 'dm' || ch.type === 'group' ? 'phone' : 'speaker'} />}
              {ch.type === 'dm' || ch.type === 'group' ? (members.length ? 'Anruf beitreten' : 'Anrufen') : 'Beitreten'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Kacheln: zuerst Streams, dann Personen
  const tiles = [];
  for (const m of members) if (m.screenStreamId) tiles.push({ uid: m.uid, kind: 'screen', key: m.uid + ':s' });
  const isStage = ch.type === 'stage';
  for (const m of members) if (!isStage || !m.suppressed) tiles.push({ uid: m.uid, kind: 'user', key: m.uid });
  const audience = isStage ? members.filter((m) => m.suppressed) : [];
  const focus = V.focus && tiles.find((t) => t.uid === V.focus.uid && t.kind === (V.focus.kind || 'user'));
  const setFocus = (t) => {
    V.focus = V.focus && V.focus.uid === t.uid && V.focus.kind === t.kind ? null : { uid: t.uid, kind: t.kind };
    update();
  };

  return (
    <div class="chat-wrap">
      <div class="stage">
        {isStage && <div class="stage-sec">Auf der Bühne</div>}
        {focus ? (
          <div class="tiles focus-mode">
            <Tile {...focus} serverId={serverId} onClick={() => setFocus(focus)} />
            <div class="focus-strip">
              {tiles.filter((t) => t !== focus).map((t) => (
                <Tile {...t} serverId={serverId} small onClick={() => setFocus(t)} />
              ))}
            </div>
          </div>
        ) : (
          <div class={`tiles ${tiles.length === 1 ? 'single' : ''}`} style={{ gridTemplateColumns: `repeat(${gridCols(tiles.length)}, minmax(0, 1fr))` }}>
            {tiles.map((t) => (
              <Tile {...t} serverId={serverId} onClick={() => setFocus(t)} />
            ))}
          </div>
        )}
        {isStage && audience.length > 0 && (
          <>
            <div class="stage-sec">Publikum · {audience.length}</div>
            <div class="row" style={{ padding: '8px 16px', flexWrap: 'wrap' }}>
              {audience.map((m) => (
                <div class="col" style={{ alignItems: 'center', gap: 4, width: 70 }} onContextMenu={(e) => voiceUserMenu(e, m.uid, serverId)}>
                  <Avatar uid={m.uid} size={44} serverId={serverId} round />
                  <span class="ellipsis" style={{ fontSize: 12, maxWidth: 70 }}>{m.requestToSpeak ? '✋ ' : ''}{displayName(m.uid, serverId)}</span>
                  {m.requestToSpeak && can(serverId, P.MUTE_MEMBERS) && (
                    <button class="btn sm ok" onClick={() => act('voiceModerate', { userId: m.uid, suppressed: false })}>Bühne</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        <div class="row" style={{ justifyContent: 'center', position: 'relative' }}>
          <CallControls ch={ch} />
          {serverId && (
            <button class={`ibtn ${showChat ? 'on' : ''}`} style={{ position: 'absolute', right: 14 }} data-tip="Text-Chat im Sprachkanal" onClick={() => setShowChat(!showChat)}>
              <Icon name="chat" />
            </button>
          )}
        </div>
      </div>
      {showChat && (
        <div class="side-panel">
          <div class="chead">
            <Icon name="chat" size={18} />
            <div class="title grow">Chat · {ch.name}</div>
            <button class="ibtn sm" onClick={() => setShowChat(false)}>
              <Icon name="x" />
            </button>
          </div>
          <ChatView ch={ch} embedded />
        </div>
      )}
    </div>
  );
}

// ---------- Kleine Statuskarte unten links ----------
export function VoiceCard() {
  if (!V.channelId) return null;
  const ch = S.channels[V.channelId];
  if (!ch) return null;
  const serverId = serverIdOf(ch);
  const states = [...V.peers.values()].map((p) => p.pc.connectionState);
  const connecting = states.some((s) => s === 'new' || s === 'connecting');
  const failed = states.some((s) => s === 'failed' || s === 'disconnected');
  const pingColor = V.ping == null ? 'var(--ok)' : V.ping < 80 ? 'var(--ok)' : V.ping < 200 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div class="voice-card">
      <div class="row">
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="state" style={{ color: failed ? 'var(--danger)' : connecting ? 'var(--warn)' : pingColor }} data-tip={V.ping != null ? `Ping: ${V.ping} ms` : ''}>
            <Icon name="wave" size={16} />
            {failed ? 'Verbindungsproblem' : connecting ? 'Verbinde …' : 'Sprachchat verbunden'}
          </div>
          <div class="where ellipsis" onClick={() => navigate(serverId || '@me', ch.id)}>
            {channelTitle(ch)}
            {serverId ? ` / ${S.servers[serverId]?.name}` : ''}
          </div>
        </div>
        <button class="ibtn red" data-tip="Trennen" onClick={() => V.leave()}>
          <Icon name="hangup" />
        </button>
      </div>
      <div class="btns">
        <button class={`ibtn ${V.camStream ? 'on' : ''}`} data-tip="Kamera" onClick={() => V.toggleCamera()}>
          <Icon name={V.camStream ? 'video' : 'videoOff'} />
        </button>
        <button class={`ibtn ${V.screenStream ? 'on' : ''}`} data-tip={V.screenStream ? 'Stream beenden' : 'Bildschirm teilen'} onClick={() => (V.screenStream ? V.stopScreen() : openModal('screenshare'))}>
          <Icon name="screen" />
        </button>
        <button class="ibtn" data-tip="Soundboard" onClick={(e) => openPopout(e, 'soundboard', { prefer: 'top' })}>
          <Icon name="soundboard" />
        </button>
        <button class="ibtn" data-tip="Anzeigen" onClick={() => navigate(serverId || '@me', ch.id)}>
          <Icon name="maximize" />
        </button>
      </div>
    </div>
  );
}

// ---------- Bildschirmfreigabe-Auswahl ----------
export function ScreenShareModal() {
  const [tab, setTab] = useState('screen');
  const [sources, setSources] = useState(null);
  const [sel, setSel] = useState(null);
  const [quality, setQuality] = useState(prefs.streamQuality);
  const [content, setContent] = useState(prefs.streamContent);
  const [audio, setAudio] = useState(prefs.streamAudio);
  const audioSupported = !isElectron || window.nook.platform === 'win32' || window.nook.platform === 'darwin';
  useEffect(() => {
    if (!isElectron) return setSources([]);
    let alive = true;
    const load = () => window.nook.getSources(['screen', 'window']).then((s) => alive && setSources(s));
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const list = (sources || []).filter((s) => (tab === 'screen' ? s.isScreen : !s.isScreen));
  const go = () => {
    setPref('streamQuality', quality);
    setPref('streamContent', content);
    setPref('streamAudio', audio);
    closeModal();
    V.startScreen({ sourceId: sel, quality, audio: audio && audioSupported, content });
  };
  return (
    <Modal
      title="Bildschirm teilen"
      sub="Alle Qualitätsstufen bis 4K/120 FPS sind kostenlos freigeschaltet."
      wide
      footer={
        <>
          <button class="btn ghost" onClick={closeModal}>
            Abbrechen
          </button>
          <button class="btn" disabled={isElectron && !sel} onClick={go}>
            <Icon name="screen" /> Live gehen
          </button>
        </>
      }
    >
      {isElectron && (
        <>
          <div class="seg" style={{ marginBottom: 12, maxWidth: 300 }}>
            <button class={tab === 'screen' ? 'on' : ''} onClick={() => setTab('screen')}>
              Bildschirme
            </button>
            <button class={tab === 'window' ? 'on' : ''} onClick={() => setTab('window')}>
              Fenster & Spiele
            </button>
          </div>
          {!sources ? (
            <div class="row" style={{ justifyContent: 'center', padding: 40 }}>
              <Spinner />
            </div>
          ) : (
            <div class="src-grid">
              {list.map((s) => (
                <button class={`src ${sel === s.id ? 'on' : ''}`} onClick={() => setSel(s.id)} onDblClick={() => { setSel(s.id); setTimeout(go); }}>
                  <img class="th" src={s.thumbnail} />
                  <div class="sn">
                    {s.icon && <img src={s.icon} />}
                    <span class="ellipsis">{s.name}</span>
                  </div>
                </button>
              ))}
              {!list.length && <div class="hint">Keine Quellen gefunden.{window.nook.platform === 'darwin' ? ' Erlaube Nook unter Systemeinstellungen → Datenschutz → Bildschirmaufnahme.' : ''}</div>}
            </div>
          )}
        </>
      )}
      {!isElectron && <div class="hint" style={{ marginBottom: 12 }}>Dein Browser fragt gleich, was du teilen willst.</div>}
      <div class="field" style={{ marginTop: 16 }}>
        <label>Auflösung & Bildrate</label>
        <div class="seg">
          {Object.entries(QUALITY).map(([k, q]) => (
            <button class={quality === k ? 'on' : ''} onClick={() => setQuality(k)}>
              {q.label.replace(' · ', ' ')}
            </button>
          ))}
        </div>
      </div>
      <div class="row" style={{ alignItems: 'flex-start', gap: 20 }}>
        <div class="field grow">
          <label>Optimieren für</label>
          <Seg value={content} onChange={setContent} options={[['motion', '🎮 Flüssigkeit (Spiele, Videos)'], ['detail', '📝 Schärfe (Text, Code)']]} />
        </div>
        <div class="field">
          <label>Ton</label>
          <button class={`btn ${audio ? '' : 'ghost'}`} onClick={() => setAudio(!audio)} disabled={!audioSupported}>
            <Icon name={audio ? 'volume' : 'x'} /> {audio ? 'Systemton teilen' : 'Ohne Ton'}
          </button>
        </div>
      </div>
      <div class="hint">Tipp: Für 4K/60 brauchst du eine gute Upload-Leitung (ca. 35 Mbit/s pro Zuschauer). Bei Rucklern einfach eine Stufe runter.</div>
    </Modal>
  );
}

// ---------- Eingehender Anruf ----------
export function IncomingCall() {
  const c = S.incomingCall;
  if (!c) return null;
  const ch = S.channels[c.channelId];
  if (!ch) return null;
  return (
    <div class="incoming">
      <div class="ring-av">
        <Avatar uid={c.from} size={84} round />
      </div>
      <h3 style={{ margin: '14px 0 2px' }}>{displayName(c.from)}</h3>
      <div class="muted" style={{ fontSize: 13 }}>{ch.type === 'group' ? `ruft in ${channelTitle(ch)} an …` : 'ruft dich an …'}</div>
      <div class="row" style={{ justifyContent: 'center', gap: 24, marginTop: 18 }}>
        <button class="round-btn red" data-tip="Ablehnen" onClick={() => { rpc('declineCall', { channelId: c.channelId }).catch(() => {}); dismissCall(); }}>
          <Icon name="hangup" />
        </button>
        <button class="round-btn" style={{ background: 'var(--ok)', color: '#04140d' }} data-tip="Annehmen" onClick={() => { dismissCall(); navigate('@me', c.channelId); V.join(c.channelId); }}>
          <Icon name="phone" />
        </button>
      </div>
    </div>
  );
}

export function SoundboardPopout({ close }) {
  return <SoundboardPicker onPlay={(s) => V.playSound(s)} />;
}
