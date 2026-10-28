import { useState, useEffect, useRef } from 'preact/hooks';
import { S, update, prefs, setPref, confirmDialog, promptDialog, toast } from './store';
import { act, rpc, pickAndUpload, pickAvatar, pickFile, upload, fileUrl, logout, displayName, isElectron, copy, AVATAR_VIDEO_MAX_S } from './api';
import { Avatar, Switch, ToggleRow, Seg, SegBox, Video, Spinner, useIndicator, WALLPAPERS, wallpaperId } from './ui';
import { Icon } from './icons';
import { ProfileCard } from './profile';
import { DECORATIONS, EFFECTS, NAMEPLATES, NAME_FONTS, NAME_EFFECTS, FRAMES, BUNDLES, Frame, EffectLayer } from './cosmetics';
import { NameText } from './ui';
import { V, QUALITY } from './voice';
import { previewSound, PACKS, SOUND_EVENTS } from './sounds';
import { clearMarkdownCache } from './markdown';
import { fadeIn, withTransition } from './fx';
import { setGlass, refractionSupported, windowCaps } from './glass';

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
const profileState = (me) => ({
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
  frame: me.frame || '',
});

const PROFILE_TABS = [
  ['general', 'Allgemein'],
  ['bundles', '✨ Pakete'],
  ['deco', 'Avatar-Deko'],
  ['fx', 'Effekte & Rahmen'],
  ['name', 'Name & Schild'],
];

function Profile() {
  const me = S.me;
  const [p, setP] = useState(() => profileState(me));
  const [tab, setTab] = useState('general');
  const [busy, setBusy] = useState(false);
  const [tabsRef, tabInd] = useIndicator();
  const set = (k, v) => setP({ ...p, [k]: v });
  const dirty = JSON.stringify(p) !== JSON.stringify(profileState(me));
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
    const r = k === 'avatar' ? await pickAvatar() : await pickAndUpload('image/*');
    if (r) set(k, r.url);
  };
  return (
    <>
      <h1>Profil</h1>
      <div class="hint" style={{ marginTop: -14, marginBottom: 18 }}>
        ✨ Alles freigeschaltet: animierte Avatare & Banner (GIF), Profil-Farbthemen, animierte Avatar-Dekorationen, Profilrahmen, Profil-Effekte und Namens-Stile.
      </div>
      <div class="ptabs" ref={tabsRef}>
        {tabInd}
        {PROFILE_TABS.map(([v, l]) => (
          <button class={tab === v ? 'on' : ''} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      <div class="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div class="grow ptab-body" style={{ minWidth: 0 }} key={tab}>
          {tab === 'general' && (
            <>
              <div class="field">
                <label>Anzeigename</label>
                <input class="input" value={p.displayName} maxLength={32} onInput={(e) => set('displayName', e.target.value)} />
              </div>
              <div class="field">
                <label>Pronomen</label>
                <input class="input" value={p.pronouns} maxLength={40} placeholder="z. B. er/ihm, sie/ihr" onInput={(e) => set('pronouns', e.target.value)} />
              </div>
              <div class="field">
                <label>Avatar (Bild, GIF oder Video bis {AVATAR_VIDEO_MAX_S} s)</label>
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
                <label>Akzent- & Bannerfarbe</label>
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
            </>
          )}
          {tab === 'bundles' && <BundlePicker p={p} onApply={(items) => setP({ ...p, ...items })} avatar={fileUrl(p.avatar)} name={p.displayName} />}
          {tab === 'deco' && <DecoPicker value={p.decoration} onPick={(v) => set('decoration', v)} avatar={fileUrl(p.avatar)} name={p.displayName} />}
          {tab === 'fx' && (
            <>
              <div class="field">
                <label>Profilrahmen ({FRAMES.length - 1})</label>
                <div class="picker-grid">
                  {FRAMES.map((f) => (
                    <button class={`opt ${p.frame === f.id ? 'on' : ''}`} onClick={() => set('frame', f.id)}>
                      <div class={`frame-prev ${f.id ? 'framed fr-' + f.id : ''}`} style={{ '--uacc': p.accent }}>
                        <Frame id={f.id} />
                      </div>
                      <span class="ellipsis" style={{ maxWidth: '100%' }}>{f.name}</span>
                    </button>
                  ))}
                </div>
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
            </>
          )}
          {tab === 'name' && (
            <>
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
            </>
          )}
        </div>
        <div style={{ position: 'sticky', top: 0 }}>
          <div class="label" style={{ marginBottom: 8 }}>Vorschau</div>
          <ProfileCard uid={me.id} preview={p} actions={false} />
        </div>
      </div>
      {dirty && (
        <div class="card row save-bar">
          <span class="grow">Du hast ungespeicherte Änderungen.</span>
          <button class="btn link" onClick={() => setP(profileState(me))}>Zurücksetzen</button>
          <button class="btn ok" onClick={save} disabled={busy}>Speichern</button>
        </div>
      )}
    </>
  );
}

// Pakete: Deko, Effekt, Namensschild und Rahmen im selben Stil auf einen Klick
function BundlePicker({ p, onApply, avatar, name }) {
  return (
    <div class="field">
      <label>Pakete · alles passend auf einen Klick</label>
      {[...new Set(BUNDLES.map((b) => b.family))].map((fam) => (
        <>
          <div class="cat-title">{fam}</div>
          <div class="bundles">
            {BUNDLES.filter((b) => b.family === fam).map((b) => {
              const on = Object.entries(b.items).every(([k, v]) => p[k] === v);
              return (
                <div class={`bundle ${on ? 'on' : ''}`} style={{ '--wg': b.glow }}>
                  <div class="bundle-stage">
                    <EffectLayer id={b.items.effect} />
                    <Avatar uid={S.me.id} size={76} src={avatar} name={name} decoration={b.items.decoration} />
                  </div>
                  <div class="bundle-body">
                    <b>{b.name}</b>
                    <div class="muted" style={{ fontSize: 12.5 }}>Paket enthält 4 Gegenstände</div>
                    <div class="bundle-items">
                      <span class="bundle-item" data-tip="Avatar-Dekoration">
                        <Avatar uid={S.me.id} size={26} src={avatar} name={name} decoration={b.items.decoration} />
                      </span>
                      <span class="bundle-item" data-tip="Profil-Effekt">
                        <EffectLayer id={b.items.effect} />
                      </span>
                      <span class="bundle-item" data-tip="Namensschild">
                        <div class={`np-preview nameplate np-${b.items.nameplate}`} />
                      </span>
                      <span class="bundle-item" data-tip="Profilrahmen">
                        <div class={`frame-prev framed fr-${b.items.frame}`}>
                          <Frame id={b.items.frame} />
                        </div>
                      </span>
                    </div>
                    <button class="btn sm" onClick={() => onApply(on ? { decoration: '', effect: '', nameplate: '', frame: '' } : b.items)}>
                      {on ? '✓ Ausgerüstet · ablegen' : 'Ausrüsten'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ))}
      <div class="hint" style={{ marginTop: 10 }}>Die Teile lassen sich danach auch einzeln in den anderen Reitern tauschen. Vergiss nicht zu speichern.</div>
    </div>
  );
}

// Auswahl der Avatar-Dekorationen mit Kategorien, „Neu"-Filter und Suche
function DecoPicker({ value, onPick, avatar, name }) {
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const cats = [...new Set(DECORATIONS.filter((d) => d.id).map((d) => d.cat))];
  const list = DECORATIONS.filter((d) => d.id && (!cat || (cat === '*neu' ? d.neu : d.cat === cat)) && (!q || d.name.toLowerCase().includes(q.toLowerCase())));
  const chip = (v, label) => (
    <button class={`fchip ${cat === v ? 'on' : ''}`} onClick={() => setCat(v)}>
      {label}
    </button>
  );
  return (
    <div class="field">
      <div class="row" style={{ marginBottom: 4 }}>
        <label class="label grow">Avatar-Dekoration ({DECORATIONS.length - 1})</label>
        <div class="search-box" style={{ margin: 0 }}>
          <Icon name="search" />
          <input placeholder="Dekoration suchen" value={q} onInput={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div class="fchips">
        {chip('', 'Alle')}
        {chip('*neu', '✨ Neu & animiert')}
        {cats.map((c) => chip(c, c))}
      </div>
      <div class="picker-grid deco-grid">
        {!q && !cat && (
          <button class={`opt deco-opt ${!value ? 'on' : ''}`} onClick={() => onPick('')}>
            <Avatar uid={S.me.id} size={52} src={avatar} name={name} decoration="" />
            <span>Keine</span>
          </button>
        )}
        {list.map((d) => (
          <button class={`opt deco-opt ${value === d.id ? 'on' : ''}`} onClick={() => onPick(d.id)} key={d.id}>
            {d.neu && <span class="neu">NEU</span>}
            <Avatar uid={S.me.id} size={52} src={avatar} name={name} decoration={d.id} />
            <span class="ellipsis" style={{ maxWidth: '100%' }}>{d.name}</span>
          </button>
        ))}
        {!list.length && <div class="hint">Nichts gefunden.</div>}
      </div>
    </div>
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
// Mini-Hintergrund für Vorschauen (gleiche Klassen wie der echte Hintergrund)
function WallpaperThumb({ id }) {
  return (
    <div class={`wallpaper thumb wp-${id}`} style={id === 'custom' && prefs.wallpaperUrl ? { '--wp-img': `url("${fileUrl(prefs.wallpaperUrl)}")` } : null}>
      <i />
      <i />
      <i />
    </div>
  );
}

const GLASS_MODES = [
  ['', 'Aus'],
  ['tinted', '💧 Getönt'],
  ['clear', '🫧 Klar'],
];

// fertige Glas-Stile: Variante + Regler (Durchsichtigkeit, Unschärfe, Lichtbrechung, Glanz)
const GLASS_STYLES = [
  ['standard', 'Standard', '💧', { glass: 'tinted', glassClarity: 50, glassBlur: 50, glassRefractStr: 50, glassShine: 50 }],
  ['see', 'Durchsicht', '👀', { glass: 'clear', glassClarity: 85, glassBlur: 10, glassRefractStr: 70, glassShine: 70 }],
  ['crystal', 'Kristall', '💎', { glass: 'clear', glassClarity: 100, glassBlur: 0, glassRefractStr: 100, glassShine: 100 }],
  ['frost', 'Milchglas', '🌫️', { glass: 'tinted', glassClarity: 30, glassBlur: 100, glassRefractStr: 30, glassShine: 40 }],
];
const GLASS_TINTS = [
  ['', 'Automatisch', 'var(--panel2)'],
  ['white', 'Weiß', '#ffffff'],
  ['black', 'Schwarz', '#000000'],
  ['accent', 'Akzentfarbe', 'var(--accent)'],
];

function GlassSlider({ label, k, left, right }) {
  const v = prefs[k] ?? 50;
  return (
    <div class="field lg-slider">
      <label>
        {label} <b>{v}%</b>
      </label>
      <div class="row lg-range">
        <span>{left}</span>
        <input type="range" min="0" max="100" step="5" value={v} onInput={(e) => setPref(k, +e.target.value)} />
        <span>{right}</span>
      </div>
    </div>
  );
}

// Fenster: normal, Desktop verschwommen dahinter oder echtes Glas über den Apps (nur Desktop-App)
function WindowModePicker() {
  const caps = windowCaps();
  if (!caps.blur && !caps.live) return null;
  const mode = caps[prefs.windowMode] ? prefs.windowMode : '';
  const opts = [['', '🖥️ Normal'], caps.blur && ['blur', '🌫️ Desktop verschwommen'], caps.live && ['live', '🍏 Glas über deinen Apps']].filter(Boolean);
  return (
    <div class="field lg-window">
      <label>Hinter dem Fenster</label>
      <SegBox>
        {opts.map(([v, l]) => (
          <button class={mode === v ? 'on' : ''} onClick={(e) => withTransition(() => setPref('windowMode', v), e)}>
            {l}
          </button>
        ))}
      </SegBox>
      <div class="hint" style={{ marginTop: 8 }}>
        {mode === 'live'
          ? 'Nook liegt wie Apple-Glas über den Apps dahinter. Mit „Unschärfe“, „Lichtbrechung“ und „Durchsichtigkeit“ stellst du ein, wie stark.'
          : mode === 'blur'
            ? 'Dein Desktop scheint weich verschwommen durch die ganze App (Glas vom System).'
            : 'Hinter Nook liegt dein gewählter Hintergrund.'}
      </div>
      {mode === 'live' && (
        <ToggleRow
          title="In Bildschirmübertragungen sichtbar"
          desc={
            prefs.liveVisible !== false
              ? 'An: Nook ist in Übertragungen und Screenshots zu sehen. Hinter dem Glas liegt ein Standbild deiner Apps, das sich erneuert, sobald du zu Nook zurückkommst.'
              : 'Aus: Die Apps hinter dem Glas bewegen sich live mit. Nook ist dafür in Übertragungen und Screenshots ausgeblendet.'
          }
          on={prefs.liveVisible !== false}
          onChange={(v) => setPref('liveVisible', v)}
        />
      )}
    </div>
  );
}

function GlassCustomizer() {
  const active = GLASS_STYLES.find(([, , , p]) => Object.entries(p).every(([k, v]) => (prefs[k] ?? 50) === v))?.[0];
  const applyStyle = (p, e) =>
    withTransition(() => {
      for (const [k, v] of Object.entries(p)) prefs[k] = v;
      prefs.glassRefraction = true;
      setGlass(p.glass);
    }, e);
  const customTint = /^#[0-9a-f]{6}$/i.test(prefs.glassTint) ? prefs.glassTint : '';
  return (
    <div class="card lg-custom">
      <b class="lg-title">Glas anpassen</b>
      <div class="hint">Stell selbst ein, wie stark man durch das Glas schaut – oder nimm einen fertigen Stil.</div>
      <div class="lg-styles">
        {GLASS_STYLES.map(([id, name, ic, p]) => (
          <button class={`lg-style ${active === id ? 'on' : ''}`} onClick={(e) => applyStyle(p, e)}>
            <span>{ic}</span>
            {name}
          </button>
        ))}
      </div>
      <GlassSlider label="Durchsichtigkeit" k="glassClarity" left="Getönt" right="Ganz klar" />
      <GlassSlider label="Unschärfe" k="glassBlur" left="Scharf" right="Milchig" />
      {refractionSupported() ? (
        <div class="field lg-slider">
          <label>
            Lichtbrechung <b>{prefs.glassRefraction ? prefs.glassRefractStr : 0}%</b>
          </label>
          <div class="row lg-range">
            <span>Aus</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={prefs.glassRefraction ? prefs.glassRefractStr : 0}
              onInput={(e) => {
                prefs.glassRefraction = +e.target.value > 0;
                setPref('glassRefractStr', +e.target.value);
              }}
            />
            <span>Stark</span>
          </div>
        </div>
      ) : (
        <div class="hint" style={{ margin: '4px 0 12px' }}>Dieser Browser kann nur den Weichzeichner. Die echte Lichtbrechung gibt es in der Nook-App, in Chrome und in Edge.</div>
      )}
      <GlassSlider label="Glanz" k="glassShine" left="Matt" right="Glänzend" />
      <div class="field">
        <label>Glasfarbe</label>
        <div class="row lg-tints">
          {GLASS_TINTS.map(([id, name, c]) => (
            <button class={`lg-tint ${prefs.glassTint === id ? 'on' : ''}`} data-tip={name} style={{ '--c': c }} onClick={() => setPref('glassTint', id)} />
          ))}
          <label class={`lg-tint custom ${customTint ? 'on' : ''}`} data-tip="Eigene Farbe" style={{ '--c': customTint || 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
            <input type="color" value={customTint || '#7c5cff'} onInput={(e) => setPref('glassTint', e.target.value)} />
          </label>
        </div>
      </div>
      <WindowModePicker />
    </div>
  );
}

function Appearance() {
  const wp = wallpaperId();
  // vorhandenes eigenes Bild zuerst auswählen, ein weiterer Klick tauscht es aus
  const pickWallpaper = async () => {
    if (prefs.wallpaperUrl && wp !== 'custom') return withTransition(() => setPref('wallpaper', 'custom'));
    const r = await pickAndUpload('image/*');
    if (!r) return;
    setPref('wallpaperUrl', r.url);
    withTransition(() => setPref('wallpaper', 'custom'));
  };
  return (
    <>
      <h1>Darstellung</h1>
      <Section title="Liquid Glass">
        <div class="card lg-card">
          <div class="lg-demo" aria-hidden="true">
            <WallpaperThumb id={wp} />
            <div class="lg-glass">
              <span class="lg-dot" />
              <span class="lg-line" />
              <span class="lg-line short" />
            </div>
          </div>
          <div class="grow" style={{ minWidth: 0 }}>
            <b class="lg-title">Glas, das Licht bricht</b>
            <div class="hint">Leisten, Fenster und Menüs werden zu durchsichtigem Glas: Dein Hintergrund schimmert durch und wird an den Kanten wie von einer Linse gebogen. Schnell umschalten mit Strg+Umschalt+G.</div>
            <SegBox style={{ marginTop: 14 }}>
              {GLASS_MODES.map(([v, l]) => (
                <button class={prefs.glass === v ? 'on' : ''} onClick={(e) => withTransition(() => setGlass(v), e)}>
                  {l}
                </button>
              ))}
            </SegBox>
          </div>
        </div>
        {prefs.glass && <GlassCustomizer />}
      </Section>
      <Section title="Hintergrund">
        <div class="wp-grid">
          {WALLPAPERS.map(([id, name, desc]) => (
            <button class={`wp-opt ${wp === id ? 'on' : ''}`} onClick={(e) => withTransition(() => setPref('wallpaper', id), e)}>
              <div class="wp-prev">
                <WallpaperThumb id={id} />
              </div>
              <div class="tn">{name}</div>
              <div class="td">{desc}</div>
            </button>
          ))}
          <button class={`wp-opt ${wp === 'custom' ? 'on' : ''}`} onClick={pickWallpaper}>
            <div class="wp-prev">
              {prefs.wallpaperUrl ? (
                <WallpaperThumb id="custom" />
              ) : (
                <div class="wp-add">
                  <Icon name="upload" />
                </div>
              )}
            </div>
            <div class="tn">Eigenes Bild</div>
            <div class="td">{!prefs.wallpaperUrl ? 'Bild hochladen' : wp === 'custom' ? 'Klicken zum Ändern' : 'Dein Bild'}</div>
          </button>
        </div>
        <ToggleRow title="Bewegter Hintergrund" desc="Die Farbwolken treiben ganz langsam" on={prefs.wallpaperMotion} onChange={(v) => setPref('wallpaperMotion', v)} />
        {!prefs.glass && <div class="hint">Tipp: Am schönsten wirkt der Hintergrund mit Liquid Glass – ohne ist er nur leicht zu sehen.</div>}
        {prefs.glass && windowCaps()[prefs.windowMode] && <div class="hint">Gerade schaust du durch das Fenster auf deinen Desktop. Der Hintergrund hier gilt wieder, sobald das Fenster auf „Normal“ steht.</div>}
      </Section>
      <Section title="Farbschema">
        <div class="row" style={{ flexWrap: 'wrap' }}>
          {THEMES.map(([id, name, c]) => (
            <button class={`theme-opt ${prefs.theme === id ? 'on' : ''}`} onClick={(e) => withTransition(() => setPref('theme', id), e)}>
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
              <button class={`swatch ${prefs.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={(e) => withTransition(() => setPref('accent', c), e)} />
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
    // Gerätenamen gibt es erst nach einer Mikrofon-Freigabe – das Mikro nur dann kurz öffnen, wenn sie fehlen
    // (jedes Öffnen schaltet Bluetooth-Headsets in den Freisprech-Modus)
    navigator.mediaDevices.enumerateDevices().then((d) => {
      if (d.some((x) => x.kind === 'audioinput' && x.label)) return setDevices(d);
      navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); load(); }).catch(load);
    });
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

// ---------- Sounds ----------
const MAX_SOUND_BYTES = 3 * 1024 * 1024;

// kleine Equalizer-Balken, die tanzen, solange ein Sound läuft
function Eq({ on }) {
  return (
    <span class={`eq ${on ? 'on' : ''}`}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function Sounds() {
  const [playing, setPlaying] = useState(null);
  const timer = useRef();
  const flash = (key) => {
    setPlaying(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(null), 1100);
  };
  const setEvent = (k, on) => setPref('soundEvents', { ...prefs.soundEvents, [k]: on });
  const setCustom = (k, v) => {
    const c = { ...prefs.customSounds };
    if (v) c[k] = v;
    else delete c[k];
    setPref('customSounds', c);
  };
  const pickCustom = async (k) => {
    const file = await pickFile('audio/*');
    if (!file) return;
    if (file.size > MAX_SOUND_BYTES) return toast('Sound zu groß (max. 3 MB) – kurze Clips klingen eh am besten', 'error');
    try {
      const r = await upload(file);
      setCustom(k, { url: r.url, name: r.name || file.name });
      flash(k);
      setTimeout(() => previewSound(k), 50);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const pack = PACKS.find((p) => p.id === prefs.soundPack) || PACKS[0];
  return (
    <>
      <h1>Sounds</h1>
      <div class="hint" style={{ marginTop: -14, marginBottom: 18 }}>
        🎵 Wähle ein Sound-Paket für die ganze App oder lade für einzelne Ereignisse deine eigenen Töne hoch (MP3, WAV, OGG …).
      </div>
      <div class="card">
        <ToggleRow title="Sounds aktiviert" desc="Nachrichten-, Anruf- und Sprachkanal-Töne" on={prefs.sounds} onChange={(v) => setPref('sounds', v)} />
        <div class="field" style={{ marginTop: 14, marginBottom: 0 }}>
          <label>Lautstärke: {Math.round(prefs.soundVolume * 100)}%</label>
          <input type="range" min="0" max="1" step="0.05" value={prefs.soundVolume} onInput={(e) => setPref('soundVolume', +e.target.value)} onChange={() => previewSound('message')} />
        </div>
      </div>
      <h3>Sound-Paket</h3>
      <div class="spacks">
        {PACKS.map((p) => (
          <button
            class={`spack ${prefs.soundPack === p.id || (!prefs.soundPack && p.id === 'nook') ? 'on' : ''} ${playing === 'pack:' + p.id ? 'playing' : ''}`}
            onClick={() => {
              setPref('soundPack', p.id);
              previewSound('mention', p.id);
              flash('pack:' + p.id);
            }}
          >
            <span class="spack-emoji">{p.emoji}</span>
            <span class="grow" style={{ minWidth: 0 }}>
              <b>{p.name}</b>
              <span class="spack-desc">{p.desc}</span>
            </span>
            <Eq on={playing === 'pack:' + p.id} />
          </button>
        ))}
      </div>
      <h3>Ereignisse</h3>
      <div class="hint" style={{ marginTop: -6, marginBottom: 10 }}>
        Mit ▶ anhören, mit ⬆ einen eigenen Sound hochladen. Eigene Sounds liegen auf eurem Server und gelten auf diesem Gerät.
      </div>
      <div class="sevents">
        {SOUND_EVENTS.map(([k, label]) => {
          const custom = prefs.customSounds?.[k];
          const on = prefs.soundEvents?.[k] !== false;
          return (
            <div class={`sev ${on ? '' : 'off'} ${playing === k ? 'playing' : ''}`}>
              <button class="ibtn sev-play" data-tip="Anhören" onClick={() => { previewSound(k); flash(k); }}>
                {playing === k ? <Eq on /> : <Icon name="play" size={18} />}
              </button>
              <div class="grow" style={{ minWidth: 0 }}>
                <div class="sev-name">{label}</div>
                <div class="sev-src ellipsis">
                  {custom ? (
                    <span class="sev-custom">
                      🎧 {custom.name}
                      <button data-tip="Eigenen Sound entfernen" onClick={() => setCustom(k, null)}>
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  ) : (
                    <span>
                      {pack.emoji} {pack.name}
                    </span>
                  )}
                </div>
              </div>
              <button class="ibtn sm" data-tip="Eigenen Sound hochladen" onClick={() => pickCustom(k)}>
                <Icon name="upload" />
              </button>
              <Switch on={on} onChange={(v) => setEvent(k, v)} />
            </div>
          );
        })}
      </div>
      <div class="row" style={{ marginTop: 14 }}>
        <button class="btn ghost sm" disabled={!Object.keys(prefs.customSounds || {}).length} onClick={() => setPref('customSounds', {})}>
          Alle eigenen Sounds entfernen
        </button>
      </div>
    </>
  );
}

// ---------- Benachrichtigungen ----------
function Notifications() {
  return (
    <>
      <h1>Benachrichtigungen</h1>
      <ToggleRow title="Desktop-Benachrichtigungen" desc="Für DMs und Erwähnungen, wenn das Fenster nicht aktiv ist" on={prefs.desktopNotifs} onChange={(v) => setPref('desktopNotifs', v)} />
      <div class="toggle-row">
        <div class="grow">
          <div class="t">Sounds</div>
          <div class="d">Sound-Pakete, eigene Töne und Lautstärke findest du unter „Sounds".</div>
        </div>
        <button class="btn ghost sm" onClick={() => { S.settings = { tab: 'sounds' }; update(); }}>
          Sounds anpassen
        </button>
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
    [['Strg', 'Umschalt', 'G'], 'Liquid Glass ein/aus'],
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
  const mainRef = useRef();
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    fadeIn(mainRef.current);
  }, [tab]);
  const tabs = [
    ['Benutzer', [['account', 'Mein Konto', 'at'], ['profile', 'Profil', 'smile'], ['privacy', 'Datenschutz', 'shield']]],
    ['App', [['appearance', 'Darstellung', 'palette'], ['voice', 'Sprache & Video', 'mic'], ['notifications', 'Benachrichtigungen', 'bell'], ['sounds', 'Sounds', 'volume'], ['keybinds', 'Tastenkürzel', 'keyboard'], isElectron && ['host', 'Server hosten', 'server'], isElectron && ['app', 'App & Autostart', 'gear'], ['about', 'Über Nook', 'sparkle']]],
  ];
  const [navRef, navInd] = useIndicator();
  const C = { account: Account, profile: Profile, privacy: Privacy, appearance: Appearance, voice: Voice, notifications: Notifications, sounds: Sounds, keybinds: Keybinds, host: Host, app: AppSettings, about: About }[tab] || Account;
  return (
    <div class="settings">
      <nav>
        <div class="inner" ref={navRef}>
          {navInd}
          {tabs.map(([h, items]) => (
            <>
              <div class="sh">{h}</div>
              {items.filter(Boolean).map(([id, l, ic]) => (
                <button class={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                  <Icon name={ic} size={18} />
                  {l}
                </button>
              ))}
            </>
          ))}
          <div class="divider" />
          <button class="danger" onClick={async () => (await confirmDialog('Abmelden', 'Wirklich abmelden?', { ok: 'Abmelden' })) && logout()}>
            <Icon name="logout" size={18} />
            Abmelden
          </button>
        </div>
      </nav>
      <main ref={mainRef}>
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
