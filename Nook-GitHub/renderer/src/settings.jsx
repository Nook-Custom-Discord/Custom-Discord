import { useState, useEffect, useRef } from 'preact/hooks';
import { S, update, prefs, setPref, confirmDialog, promptDialog, toast } from './store';
import { act, rpc, pickAndUpload, fileUrl, logout, displayName, isElectron, copy } from './api';
import { Avatar, Switch, ToggleRow, Seg, Video, Spinner } from './ui';
import { Icon } from './icons';
import { ProfileCard } from './profile';
import { DECORATIONS, EFFECTS, NAMEPLATES, NAME_FONTS, NAME_EFFECTS, Deco, EffectLayer, nameClasses, nameVars } from './cosmetics';
import { NameText } from './ui';
import { V, QUALITY } from './voice';
import { sfx } from './sounds';
import { clearMarkdownCache } from './markdown';

export const THEMES = [
  ['ink', 'Tinte', ['#0b0d12', '#151922', '#1e2430']],
  ['midnight', 'Mitternacht', ['#000', '#0b0b0d', '#16161a']],
  ['dusk', 'Dämmerung', ['#120e1a', '#1c1628', '#2a2239']],
  ['forest', 'Wald', ['#0b120f', '#131e18', '#1c2b23']],
  ['paper', 'Papier', ['#e9e6df', '#fbfaf7', '#efebe4']],
];
export const ACCENTS = ['#ff7a45', '#f5c542', '#2dd4a7', '#34d399', '#4cc3ff', '#60a5fa', '#c084fc', '#ff5c8a', '#fb7185', '#a3e635', '#e2e8f0'];

function Section({ title, children }) {
  return (
    <>
      <h3>{title}</h3>
      {children}
    </>
  );
}

// ---------- Konto ----------
function Account() {
  const me = S.me;
  const [dn, setDn] = useState(me.displayName);
  const [un, setUn] = useState(me.username);
  const [pw, setPw] = useState({ old: '', new1: '', new2: '' });
  return (
    <>
      <h1>Mein Konto</h1>
      <div class="card">
        <div class="row" style={{ marginBottom: 16 }}>
          <Avatar uid={me.id} size={64} status />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{me.displayName}</div>
            <div class="muted">@{me.username}</div>
          </div>
        </div>
        <div class="field">
          <label>Anzeigename</label>
          <div class="row">
            <input class="input" value={dn} onInput={(e) => setDn(e.target.value)} maxLength={32} />
            <button class="btn" disabled={dn === me.displayName} onClick={() => act('updateProfile', { displayName: dn }, 'Gespeichert')}>Speichern</button>
          </div>
        </div>
        <div class="field">
          <label>Benutzername</label>
          <div class="row">
            <input class="input" value={un} onInput={(e) => setUn(e.target.value.toLowerCase())} maxLength={32} />
            <button class="btn" disabled={un === me.username} onClick={() => act('updateProfile', { username: un }, 'Benutzername geändert')}>Ändern</button>
          </div>
          <div class="hint">Damit finden dich Freunde. Nur a–z, 0–9, _ und .</div>
        </div>
      </div>
      <Section title="Passwort ändern">
        <div class="card">
          <div class="field">
            <label>Aktuelles Passwort</label>
            <input class="input" type="password" value={pw.old} onInput={(e) => setPw({ ...pw, old: e.target.value })} />
          </div>
          <div class="row">
            <div class="field grow">
              <label>Neues Passwort</label>
              <input class="input" type="password" value={pw.new1} onInput={(e) => setPw({ ...pw, new1: e.target.value })} />
            </div>
            <div class="field grow">
              <label>Wiederholen</label>
              <input class="input" type="password" value={pw.new2} onInput={(e) => setPw({ ...pw, new2: e.target.value })} />
            </div>
          </div>
          <button
            class="btn"
            disabled={!pw.old || !pw.new1}
            onClick={async () => {
              if (pw.new1 !== pw.new2) return toast('Passwörter stimmen nicht überein', 'error');
              await act('changePassword', { oldPassword: pw.old, newPassword: pw.new1 }, 'Passwort geändert');
              setPw({ old: '', new1: '', new2: '' });
            }}
          >
            Passwort ändern
          </button>
        </div>
      </Section>
      <Section title="Server-Verbindung">
        <div class="card row">
          <Icon name="server" />
          <div class="grow">
            <b>{S.serverUrl}</b>
            <div class="hint">Diese Adresse brauchen deine Freunde zum Einloggen.</div>
          </div>
          <button class="btn ghost sm" onClick={() => copy(S.serverUrl)}>Kopieren</button>
        </div>
      </Section>
      <Section title="Gefahrenzone">
        <div class="card row">
          <button class="btn ghost" onClick={async () => (await confirmDialog('Abmelden', 'Wirklich abmelden?', { ok: 'Abmelden' })) && logout()}>
            <Icon name="logout" /> Abmelden
          </button>
          <button
            class="btn danger"
            onClick={async () => {
              const pass = await promptDialog('Konto löschen', { label: 'Gib dein Passwort zur Bestätigung ein', ok: 'Endgültig löschen' });
              if (!pass) return;
              await act('deleteAccount', { password: pass });
              logout();
            }}
          >
            Konto löschen
          </button>
        </div>
      </Section>
    </>
  );
}

// ---------- Profil ----------
function Profile() {
  const me = S.me;
  const [p, setP] = useState(() => ({
    displayName: me.displayName,
    avatar: me.avatar || '',
    banner: me.banner || '',
    bio: me.bio || '',
    pronouns: me.pronouns || '',
    accent: me.accent || '#ff7a45',
    theme: me.theme || null,
    decoration: me.decoration || '',
    effect: me.effect || '',
    nameStyle: me.nameStyle || null,
    nameplate: me.nameplate || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP({ ...p, [k]: v });
  const dirty = JSON.stringify(p) !== JSON.stringify({ displayName: me.displayName, avatar: me.avatar || '', banner: me.banner || '', bio: me.bio || '', pronouns: me.pronouns || '', accent: me.accent || '#ff7a45', theme: me.theme || null, decoration: me.decoration || '', effect: me.effect || '', nameStyle: me.nameStyle || null, nameplate: me.nameplate || '' });
  const save = async () => {
    setBusy(true);
    try {
      const u = await act('updateProfile', p, 'Profil gespeichert');
      Object.assign(S.me, u, { status: S.me.status });
      S.users[me.id] = { ...S.users[me.id], ...u };
      update();
    } catch {}
    setBusy(false);
  };
  const up = async (k) => {
    const r = await pickAndUpload('image/*');
    if (r) set(k, r.url);
  };
  return (
    <>
      <h1>Profil</h1>
      <div class="hint" style={{ marginTop: -14, marginBottom: 18 }}>
        ✨ Alles freigeschaltet: animierte Avatare & Banner (GIF), Profil-Farbthemen, Avatar-Dekorationen, Profil-Effekte und Namens-Stile.
      </div>
      <div class="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="field">
            <label>Anzeigename</label>
            <input class="input" value={p.displayName} maxLength={32} onInput={(e) => set('displayName', e.target.value)} />
          </div>
          <div class="field">
            <label>Pronomen</label>
            <input class="input" value={p.pronouns} maxLength={40} placeholder="z. B. er/ihm, sie/ihr" onInput={(e) => set('pronouns', e.target.value)} />
          </div>
          <div class="field">
            <label>Avatar (Bild oder GIF)</label>
            <div class="row">
              <button class="btn sm" onClick={() => up('avatar')}>Avatar ändern</button>
              {p.avatar && <button class="btn link sm" onClick={() => set('avatar', '')}>Entfernen</button>}
            </div>
          </div>
          <div class="field">
            <label>Banner (Bild oder GIF)</label>
            <div class="row">
              <button class="btn sm" onClick={() => up('banner')}>Banner ändern</button>
              {p.banner && <button class="btn link sm" onClick={() => set('banner', '')}>Entfernen</button>}
            </div>
          </div>
          <div class="field">
            <label>Bannerfarbe (wenn kein Bild)</label>
            <div class="row">
              <input type="color" value={p.accent} onInput={(e) => set('accent', e.target.value)} />
              <div class="swatches">
                {ACCENTS.map((c) => (
                  <button class={`swatch ${p.accent === c ? 'on' : ''}`} style={{ background: c, width: 28, height: 28 }} onClick={() => set('accent', c)} />
                ))}
              </div>
            </div>
          </div>
          <div class="field">
            <label>Profil-Farbthema</label>
            <div class="row">
              <Switch on={!!p.theme} onChange={(v) => set('theme', v ? ['#2a1b3d', '#120c1c'] : null)} />
              {p.theme && (
                <>
                  <span class="hint">Oben</span>
                  <input type="color" value={p.theme[0]} onInput={(e) => set('theme', [e.target.value, p.theme[1]])} />
                  <span class="hint">Unten</span>
                  <input type="color" value={p.theme[1]} onInput={(e) => set('theme', [p.theme[0], e.target.value])} />
                </>
              )}
            </div>
          </div>
          <div class="field">
            <label>Über mich (Markdown möglich)</label>
            <textarea class="textarea" value={p.bio} maxLength={400} onInput={(e) => set('bio', e.target.value)} placeholder="Erzähl was über dich" />
            <div class="hint" style={{ textAlign: 'right' }}>{p.bio.length}/400</div>
          </div>
          <div class="field">
            <label>Avatar-Dekoration ({DECORATIONS.length - 1})</label>
            {[...new Set(DECORATIONS.map((d) => d.cat))].map((cat) => (
              <>
                <div class="cat-title">{cat}</div>
                <div class="picker-grid">
                  {DECORATIONS.filter((d) => d.cat === cat).map((d) => (
                    <button class={`opt ${p.decoration === d.id ? 'on' : ''}`} onClick={() => set('decoration', d.id)}>
                      <div class="avatar round" style={{ width: 48, height: 48, '--deco': p.accent, margin: '8px 0 2px' }}>
                        <div class="img" style={{ background: p.accent }} />
                        <Deco id={d.id} size={48} />
                      </div>
                      <span class="ellipsis" style={{ maxWidth: '100%' }}>{d.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ))}
          </div>
          <div class="field">
            <label>Profil-Effekt ({EFFECTS.length - 1})</label>
            <div class="picker-grid">
              {EFFECTS.map((fx) => (
                <button class={`opt ${p.effect === fx.id ? 'on' : ''}`} onClick={() => set('effect', fx.id)}>
                  <div class="fx-preview">{fx.id && <EffectLayer id={fx.id} />}</div>
                  <span class="ellipsis" style={{ maxWidth: '100%' }}>{fx.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label>Namensschild (in Mitglieder- & DM-Liste)</label>
            <div class="picker-grid">
              {NAMEPLATES.map((np) => (
                <button class={`opt ${p.nameplate === np.id ? 'on' : ''}`} onClick={() => set('nameplate', np.id)}>
                  <div class={`np-preview ${np.id ? 'nameplate np-' + np.id : ''}`} style={!np.id ? { background: 'var(--bg2)' } : null} />
                  <span class="ellipsis" style={{ maxWidth: '100%' }}>{np.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label>Namens-Stil · Schrift</label>
            <div class="picker-grid">
              {NAME_FONTS.map(([v, l]) => (
                <button class={`opt ${(p.nameStyle?.font || '') === v ? 'on' : ''}`} onClick={() => set('nameStyle', { ...(p.nameStyle || {}), font: v, colors: p.nameStyle?.colors || [] })}>
                  <span class={`nfont-${v}`} style={{ fontSize: 16, fontWeight: 800 }}>{p.displayName.slice(0, 10) || 'Name'}</span>
                  <span class="muted" style={{ fontSize: 11 }}>{l}</span>
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label>Namens-Stil · Effekt</label>
            <div class="picker-grid">
              {NAME_EFFECTS.map(([v, l]) => (
                <button class={`opt ${(p.nameStyle?.effect || '') === v ? 'on' : ''}`} onClick={() => set('nameStyle', { ...(p.nameStyle || {}), effect: v, colors: p.nameStyle?.colors || [] })}>
                  <NameText text={(p.displayName || 'Name').slice(0, 10)} ns={{ ...(p.nameStyle || {}), effect: v }} style={{ fontSize: 15, fontWeight: 800 }} />
                  <span class="muted" style={{ fontSize: 11 }}>{l}</span>
                </button>
              ))}
            </div>
            <div class="row" style={{ marginTop: 10 }}>
              <Switch on={!!p.nameStyle?.colors?.[0]} onChange={(v) => set('nameStyle', { ...(p.nameStyle || {}), colors: v ? ['#ff7a45', '#f5c542'] : [] })} />
              <span class="hint">Farbverlauf im Namen</span>
              {p.nameStyle?.colors?.[0] && (
                <>
                  <input type="color" value={p.nameStyle.colors[0]} onInput={(e) => set('nameStyle', { ...p.nameStyle, colors: [e.target.value, p.nameStyle.colors[1]] })} />
                  <input type="color" value={p.nameStyle.colors[1]} onInput={(e) => set('nameStyle', { ...p.nameStyle, colors: [p.nameStyle.colors[0], e.target.value] })} />
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{ position: 'sticky', top: 0 }}>
          <div class="label" style={{ marginBottom: 8 }}>Vorschau</div>
          <ProfileCard uid={me.id} preview={p} actions={false} />
        </div>
      </div>
      {dirty && (
        <div class="card row" style={{ position: 'sticky', bottom: 0, marginTop: 20, boxShadow: 'var(--shadow)' }}>
          <span class="grow">Du hast ungespeicherte Änderungen.</span>
          <button class="btn link" onClick={() => setP({ displayName: me.displayName, avatar: me.avatar || '', banner: me.banner || '', bio: me.bio || '', pronouns: me.pronouns || '', accent: me.accent || '#ff7a45', theme: me.theme || null, decoration: me.decoration || '', effect: me.effect || '', nameStyle: me.nameStyle || null, nameplate: me.nameplate || '' })}>Zurücksetzen</button>
          <button class="btn ok" onClick={save} disabled={busy}>Speichern</button>
        </div>
      )}
    </>
  );
}

// ---------- Datenschutz ----------
function Privacy() {
  const blocked = Object.entries(S.rel).filter(([, t]) => t === 'blocked').map(([id]) => id);
  return (
    <>
      <h1>Datenschutz & Sicherheit</h1>
      <div class="card">
        <b>Wo liegen meine Daten?</b>
        <div class="hint" style={{ marginTop: 6 }}>Alles liegt ausschließlich auf eurem eigenen Nook-Server ({S.serverUrl}). Sprache, Video und Streams gehen direkt (Peer-to-Peer) zwischen euch – nicht über fremde Firmen.</div>
      </div>
      <Section title={`Blockierte Nutzer (${blocked.length})`}>
        {blocked.map((id) => (
          <div class="list-row">
            <Avatar uid={id} size={34} />
            <div class="grow">{displayName(id)}</div>
            <button class="btn ghost sm" onClick={() => act('unblock', { userId: id })}>Entblocken</button>
          </div>
        ))}
        {!blocked.length && <div class="hint">Niemand blockiert.</div>}
      </Section>
    </>
  );
}

// ---------- Darstellung ----------
function Appearance() {
  return (
    <>
      <h1>Darstellung</h1>
      <Section title="Farbschema">
        <div class="row" style={{ flexWrap: 'wrap' }}>
          {THEMES.map(([id, name, c]) => (
            <button class={`theme-opt ${prefs.theme === id ? 'on' : ''}`} onClick={() => setPref('theme', id)}>
              <div class="tp" style={{ background: c[0] }}>
                <i style={{ background: c[1], width: 26 }} />
                <i style={{ background: c[1], flex: 1, display: 'flex', alignItems: 'flex-end', padding: 4 }}>
                  <span style={{ background: c[2], height: 12, width: '70%', borderRadius: 6, display: 'block' }} />
                </i>
              </div>
              <div class="tn">{name}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Akzentfarbe">
        <div class="row">
          <div class="swatches">
            {ACCENTS.map((c) => (
              <button class={`swatch ${prefs.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setPref('accent', c)} />
            ))}
          </div>
          <input type="color" value={prefs.accent} onInput={(e) => setPref('accent', e.target.value)} data-tip="Eigene Farbe" />
        </div>
      </Section>
      <Section title="Nachrichten">
        <div class="field">
          <label>Layout</label>
          <Seg value={prefs.density} onChange={(v) => setPref('density', v)} options={[['cozy', '💬 Bubbles'], ['compact', '📃 Kompakt (Liste)']]} />
        </div>
        <div class="field">
          <label>Schriftgröße: {Math.round(prefs.fontScale * 100)}%</label>
          <input type="range" min="0.8" max="1.3" step="0.05" value={prefs.fontScale} onInput={(e) => setPref('fontScale', +e.target.value)} />
        </div>
        <ToggleRow title="Link-Vorschauen anzeigen" on={prefs.showEmbeds} onChange={(v) => setPref('showEmbeds', v)} />
        <ToggleRow title="Mit Enter senden" desc="Aus = Strg+Enter sendet, Enter macht neue Zeile" on={prefs.sendOnEnter} onChange={(v) => setPref('sendOnEnter', v)} />
        <ToggleRow title="Rechtschreibprüfung" on={prefs.spellcheck} onChange={(v) => setPref('spellcheck', v)} />
        <ToggleRow title="Animationen reduzieren" on={prefs.reduceMotion} onChange={(v) => setPref('reduceMotion', v)} />
        <ToggleRow title="Mitgliederliste anzeigen" on={prefs.showMembers} onChange={(v) => setPref('showMembers', v)} />
      </Section>
    </>
  );
}

// ---------- Sprache & Video ----------
function useMicLevel(active) {
  const [level, setLevel] = useState(-100);
  useEffect(() => {
    if (!active) return;
    if (V.channelId) {
      const t = setInterval(() => setLevel(V.selfLevel), 60);
      return () => clearInterval(t);
    }
    let stream, ctx, t;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: prefs.inputDevice ? { exact: prefs.inputDevice } : undefined, noiseSuppression: prefs.noiseSuppression, echoCancellation: prefs.echoCancellation, autoGainControl: prefs.autoGain } });
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const g = ctx.createGain();
        g.gain.value = prefs.inputVolume;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(g).connect(an);
        const buf = new Float32Array(512);
        t = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (const x of buf) s += x * x;
          const rms = Math.sqrt(s / buf.length);
          setLevel(rms > 0 ? 20 * Math.log10(rms) : -100);
        }, 60);
      } catch {}
    })();
    return () => {
      clearInterval(t);
      stream?.getTracks().forEach((x) => x.stop());
      ctx?.close();
    };
  }, [active, prefs.inputDevice, prefs.noiseSuppression, prefs.echoCancellation]);
  return level;
}

function Voice() {
  const [devices, setDevices] = useState([]);
  const [testing, setTesting] = useState(false);
  const [camTest, setCamTest] = useState(null);
  const [binding, setBinding] = useState(false);
  const level = useMicLevel(testing);
  useEffect(() => {
    const load = () => navigator.mediaDevices.enumerateDevices().then(setDevices);
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); load(); }).catch(load);
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', load);
    };
  }, []);
  useEffect(() => () => camTest?.getTracks().forEach((t) => t.stop()), [camTest]);
  useEffect(() => {
    if (!binding) return;
    const k = (e) => {
      e.preventDefault();
      setPref('pttKey', e.code);
      setBinding(false);
    };
    window.addEventListener('keydown', k, { once: true });
    return () => window.removeEventListener('keydown', k);
  }, [binding]);
  const ins = devices.filter((d) => d.kind === 'audioinput');
  const outs = devices.filter((d) => d.kind === 'audiooutput');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const pct = (db) => Math.max(0, Math.min(100, ((db + 100) / 100) * 100));
  const apply = (k, v, restartMic) => {
    setPref(k, v);
    V.applyPrefs();
    if (restartMic && V.ctx) V.startMic();
  };
  return (
    <>
      <h1>Sprache & Video</h1>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <div class="field grow">
          <label>Eingabegerät</label>
          <select class="select" value={prefs.inputDevice} onChange={(e) => apply('inputDevice', e.target.value, true)}>
            <option value="">Standard</option>
            {ins.map((d) => <option value={d.deviceId}>{d.label || 'Mikrofon'}</option>)}
          </select>
        </div>
        <div class="field grow">
          <label>Ausgabegerät</label>
          <select class="select" value={prefs.outputDevice} onChange={(e) => apply('outputDevice', e.target.value)}>
            <option value="">Standard</option>
            {outs.map((d) => <option value={d.deviceId}>{d.label || 'Lautsprecher'}</option>)}
          </select>
        </div>
      </div>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <div class="field grow">
          <label>Eingangslautstärke: {Math.round(prefs.inputVolume * 100)}%</label>
          <input type="range" min="0" max="2" step="0.05" value={prefs.inputVolume} onInput={(e) => apply('inputVolume', +e.target.value)} />
        </div>
        <div class="field grow">
          <label>Ausgangslautstärke: {Math.round(prefs.outputVolume * 100)}%</label>
          <input type="range" min="0" max="2" step="0.05" value={prefs.outputVolume} onInput={(e) => apply('outputVolume', +e.target.value)} />
        </div>
      </div>
      <div class="card">
        <div class="row" style={{ marginBottom: 10 }}>
          <b class="grow">Mikrofontest</b>
          <button class="btn sm" onClick={() => setTesting(!testing)}>{testing ? 'Stoppen' : 'Testen'}</button>
        </div>
        <div class="meter">
          <i style={{ width: pct(level) + '%', background: level > (prefs.vadAuto ? -58 : prefs.vadThreshold) ? 'var(--ok)' : 'var(--muted)' }} />
          {prefs.inputMode === 'vad' && !prefs.vadAuto && <span class="thr" style={{ left: pct(prefs.vadThreshold) + '%' }} />}
        </div>
      </div>
      <Section title="Eingabemodus">
        <Seg value={prefs.inputMode} onChange={(v) => setPref('inputMode', v)} options={[['vad', 'Sprachaktivierung'], ['ptt', 'Push-to-Talk']]} />
        {prefs.inputMode === 'vad' ? (
          <>
            <ToggleRow title="Empfindlichkeit automatisch bestimmen" on={prefs.vadAuto} onChange={(v) => setPref('vadAuto', v)} />
            {!prefs.vadAuto && (
              <div class="field" style={{ marginTop: 10 }}>
                <label>Schwelle: {prefs.vadThreshold} dB</label>
                <input type="range" min="-100" max="0" value={prefs.vadThreshold} onInput={(e) => setPref('vadThreshold', +e.target.value)} />
              </div>
            )}
          </>
        ) : (
          <div class="card row" style={{ marginTop: 10 }}>
            <div class="grow">
              <b>Taste</b>
              <div class="hint">Funktioniert, solange das Nook-Fenster aktiv ist.</div>
            </div>
            <button class="btn ghost" onClick={() => setBinding(true)}>{binding ? 'Drücke eine Taste …' : <span class="kbd">{prefs.pttKey.replace('Key', '')}</span>}</button>
            <div class="field" style={{ margin: 0, width: 160 }}>
              <label>Verzögerung {prefs.pttDelay} ms</label>
              <input type="range" min="0" max="1000" step="20" value={prefs.pttDelay} onInput={(e) => setPref('pttDelay', +e.target.value)} />
            </div>
          </div>
        )}
      </Section>
      <Section title="Sprachverarbeitung">
        <ToggleRow title="Rauschunterdrückung" desc="Filtert Lüfter, Tastatur und Hintergrundgeräusche" on={prefs.noiseSuppression} onChange={(v) => apply('noiseSuppression', v, true)} />
        <ToggleRow title="Echounterdrückung" on={prefs.echoCancellation} onChange={(v) => apply('echoCancellation', v, true)} />
        <ToggleRow title="Automatische Verstärkung" on={prefs.autoGain} onChange={(v) => apply('autoGain', v, true)} />
        <div class="hint" style={{ marginTop: 8 }}>Sprache wird in Studio-Qualität (Opus 128 kbit/s) übertragen.</div>
      </Section>
      <Section title="Video">
        <div class="row" style={{ alignItems: 'flex-start' }}>
          <div class="field grow">
            <label>Kamera</label>
            <select class="select" value={prefs.cameraDevice} onChange={(e) => setPref('cameraDevice', e.target.value)}>
              <option value="">Standard</option>
              {cams.map((d) => <option value={d.deviceId}>{d.label || 'Kamera'}</option>)}
            </select>
          </div>
          <div class="field grow">
            <label>Kameraqualität</label>
            <Seg value={prefs.cameraQuality} onChange={(v) => setPref('cameraQuality', v)} options={[['480p', '480p'], ['720p', '720p'], ['1080p', '1080p'], ['1080p60', '1080p60']]} />
          </div>
        </div>
        <div class="card" style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          {camTest ? (
            <div style={{ width: '100%', maxWidth: 420, borderRadius: 14, overflow: 'hidden' }}>
              <Video stream={camTest} mirror />
            </div>
          ) : (
            <Icon name="video" size={40} />
          )}
          <button
            class="btn sm"
            style={{ marginTop: 10 }}
            onClick={async () => {
              if (camTest) {
                camTest.getTracks().forEach((t) => t.stop());
                return setCamTest(null);
              }
              try {
                setCamTest(await navigator.mediaDevices.getUserMedia({ video: { deviceId: prefs.cameraDevice ? { exact: prefs.cameraDevice } : undefined } }));
              } catch (e) {
                toast('Kamera nicht verfügbar: ' + e.message, 'error');
              }
            }}
          >
            {camTest ? 'Test beenden' : 'Kamera testen'}
          </button>
        </div>
      </Section>
      <Section title="Streaming (Standard)">
        <div class="field">
          <label>Qualität</label>
          <select class="select" value={prefs.streamQuality} onChange={(e) => setPref('streamQuality', e.target.value)}>
            {Object.entries(QUALITY).map(([k, q]) => <option value={k}>{q.label}</option>)}
          </select>
        </div>
      </Section>
    </>
  );
}

// ---------- Benachrichtigungen ----------
function Notifications() {
  return (
    <>
      <h1>Benachrichtigungen</h1>
      <ToggleRow title="Desktop-Benachrichtigungen" desc="Für DMs und Erwähnungen, wenn das Fenster nicht aktiv ist" on={prefs.desktopNotifs} onChange={(v) => setPref('desktopNotifs', v)} />
      <ToggleRow title="Sounds" desc="Nachrichten-, Beitritts- und Anruftöne" on={prefs.sounds} onChange={(v) => setPref('sounds', v)} />
      <div class="field" style={{ marginTop: 14 }}>
        <label>Sound-Lautstärke: {Math.round(prefs.soundVolume * 100)}%</label>
        <input type="range" min="0" max="1" step="0.05" value={prefs.soundVolume} onInput={(e) => setPref('soundVolume', +e.target.value)} onChange={() => sfx('message')} />
      </div>
      <ToggleRow title="Taskleiste blinken lassen" on={prefs.flash} onChange={(v) => setPref('flash', v)} />
      <div class="field" style={{ marginTop: 14 }}>
        <label>Automatisch „Abwesend" nach</label>
        <select class="select" value={prefs.idleMinutes} onChange={(e) => setPref('idleMinutes', +e.target.value)}>
          {[5, 10, 15, 30, 60].map((m) => <option value={m}>{m} Minuten</option>)}
        </select>
      </div>
      <div class="hint">Pro Server und Kanal kannst du per Rechtsklick → „Benachrichtigungen" genauer einstellen. Im Status „Bitte nicht stören" kommen keine Benachrichtigungen.</div>
    </>
  );
}

function Keybinds() {
  const list = [
    [['Strg', 'K'], 'Schnellwechsler öffnen'],
    [['Strg', 'Umschalt', 'M'], 'Mikrofon stummschalten'],
    [['Strg', 'Umschalt', 'D'], 'Ton aus/an'],
    [['Alt', '↑/↓'], 'Vorheriger / nächster Kanal'],
    [['Esc'], 'Antwort/Bearbeiten abbrechen, Dialog schließen'],
    [['↑'], 'Letzte eigene Nachricht bearbeiten'],
    [['Umschalt', 'Enter'], 'Neue Zeile'],
    [['Umschalt', 'Klick'], 'Auf Reaktion: Super-Reaktion · Auf Löschen: ohne Nachfrage'],
    [['Strg', ','], 'Einstellungen'],
  ];
  return (
    <>
      <h1>Tastenkürzel</h1>
      {list.map(([keys, d]) => (
        <div class="toggle-row">
          <span class="grow">{d}</span>
          <span class="row" style={{ gap: 4 }}>{keys.map((k) => <span class="kbd">{k}</span>)}</span>
        </div>
      ))}
      <div class="hint" style={{ marginTop: 12 }}>Push-to-Talk-Taste stellst du unter „Sprache & Video" ein.</div>
    </>
  );
}

// ---------- Host-Server (nur Desktop) ----------
function Host() {
  const [st, setSt] = useState(null);
  const [port, setPort] = useState(3500);
  const [busy, setBusy] = useState(false);
  const [publicIp, setPublicIp] = useState(null);
  useEffect(() => {
    window.nook.host.status().then((s) => { setSt(s); setPort(s.port); });
    fetch('https://api.ipify.org?format=json').then((r) => r.json()).then((d) => setPublicIp(d.ip)).catch(() => {});
  }, []);
  if (!st) return <Spinner />;
  return (
    <>
      <h1>Server hosten</h1>
      <div class="hint" style={{ marginTop: -14, marginBottom: 18 }}>Dein PC wird zum Nook-Server für eure Gruppe. Solange Nook bei dir läuft (auch minimiert im Tray), können sich alle verbinden.</div>
      <div class="card">
        <div class="row">
          <div class="grow">
            <b style={{ color: st.running ? 'var(--ok)' : 'var(--muted)' }}>{st.running ? '● Server läuft' : '○ Server gestoppt'}</b>
            <div class="hint">Startet automatisch mit der App, wenn aktiviert.</div>
          </div>
          <div class="field" style={{ margin: 0, width: 110 }}>
            <label>Port</label>
            <input class="input" type="number" value={port} disabled={st.running} onInput={(e) => setPort(+e.target.value)} />
          </div>
          <button
            class={`btn ${st.running ? 'danger' : 'ok'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = st.running ? await window.nook.host.stop() : await window.nook.host.start(port);
              if (r.error) toast(r.error, 'error');
              setSt(await window.nook.host.status());
              setBusy(false);
            }}
          >
            {st.running ? 'Stoppen' : 'Starten'}
          </button>
        </div>
      </div>
      {st.running && (
        <>
          <h3>Adressen für deine Freunde</h3>
          <div class="card">
            <div class="list-row">
              <div class="grow">
                <b>Im selben WLAN / Netzwerk</b>
                {st.ips.map((ip) => <div><code>http://{ip}:{st.port}</code></div>)}
              </div>
              <button class="btn ghost sm" onClick={() => copy(`http://${st.ips[0]}:${st.port}`)}>Kopieren</button>
            </div>
            <div class="list-row">
              <div class="grow">
                <b>Über das Internet</b>
                <div><code>http://{publicIp || 'DEINE-ÖFFENTLICHE-IP'}:{st.port}</code></div>
                <div class="hint">Damit das klappt, musst du im Router eine Portweiterleitung für TCP-Port {st.port} auf {st.ips[0]} einrichten (siehe Anleitung in der README). Alternative ohne Router: Tailscale (kostenlos).</div>
              </div>
              <button class="btn ghost sm" onClick={() => copy(`http://${publicIp}:${st.port}`)} disabled={!publicIp}>Kopieren</button>
            </div>
            <div class="list-row">
              <div class="grow">
                <b>Auf diesem PC</b>
                <div><code>http://localhost:{st.port}</code></div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AppSettings() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    window.nook.getConfig().then(setCfg);
  }, []);
  if (!cfg) return <Spinner />;
  const set = async (k, v) => {
    await window.nook.setConfig({ [k]: v });
    setCfg({ ...cfg, [k]: v });
  };
  return (
    <>
      <h1>App</h1>
      <ToggleRow title="Beim Schließen in den Tray minimieren" desc="Nook läuft im Hintergrund weiter, damit du Nachrichten & Anrufe bekommst" on={cfg.closeToTray} onChange={(v) => set('closeToTray', v)} />
      <ToggleRow title="Mit dem System starten" on={cfg.autoStart} onChange={(v) => set('autoStart', v)} />
      <div class="hint" style={{ marginTop: 16 }}>Version {cfg.version} · {cfg.platform}</div>
    </>
  );
}

function About() {
  return (
    <>
      <h1>Über Nook</h1>
      <div class="card">
        <div style={{ fontSize: 40 }}>🏡</div>
        <h2 style={{ margin: '8px 0' }}>Nook – euer privater Treffpunkt</h2>
        <p class="hint">Chat, Sprache, Video und Streams für deine Freundesgruppe. Gratis, ohne Abo, ohne Werbung, auf eurem eigenen Server. Alles, was anderswo extra kostet, ist hier einfach an: 2-GB-Uploads, 4K/60-Streams, animierte Avatare, Profil-Themes, eigene Emojis & Sounds überall.</p>
      </div>
    </>
  );
}

export function SettingsView() {
  const tab = S.settings.tab;
  const setTab = (t) => {
    S.settings = { tab: t };
    update();
  };
  const close = () => {
    S.settings = null;
    clearMarkdownCache();
    update();
  };
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !S.modals.length && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const tabs = [
    ['Benutzer', [['account', 'Mein Konto'], ['profile', 'Profil'], ['privacy', 'Datenschutz']]],
    ['App', [['appearance', 'Darstellung'], ['voice', 'Sprache & Video'], ['notifications', 'Benachrichtigungen'], ['keybinds', 'Tastenkürzel'], isElectron && ['host', 'Server hosten'], isElectron && ['app', 'App & Autostart'], ['about', 'Über Nook']]],
  ];
  const C = { account: Account, profile: Profile, privacy: Privacy, appearance: Appearance, voice: Voice, notifications: Notifications, keybinds: Keybinds, host: Host, app: AppSettings, about: About }[tab] || Account;
  return (
    <div class="settings">
      <nav>
        <div class="inner">
          {tabs.map(([h, items]) => (
            <>
              <div class="sh">{h}</div>
              {items.filter(Boolean).map(([id, l]) => (
                <button class={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                  {l}
                </button>
              ))}
            </>
          ))}
          <div class="divider" />
          <button class="danger" onClick={async () => (await confirmDialog('Abmelden', 'Wirklich abmelden?', { ok: 'Abmelden' })) && logout()}>
            Abmelden
          </button>
        </div>
      </nav>
      <main>
        <C />
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
