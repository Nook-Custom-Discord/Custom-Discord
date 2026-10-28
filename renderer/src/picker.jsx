import { useState, useRef, useEffect } from 'preact/hooks';
import { S, prefs, setPref } from './store';
import { allCustomEmojis, emojiUrl, allSounds } from './api';
import { CATEGORIES, CATEGORY_ICONS, NAME_OF } from './emoji';
import { ServerIcon } from './ui';
import { Icon } from './icons';

export function pushRecent(e) {
  const list = [e, ...prefs.recentEmojis.filter((x) => x !== e)].slice(0, 24);
  setPref('recentEmojis', list);
}

export function EmojiView({ e, size = 20 }) {
  const m = /^<a?:(\w+):([\w.]+)>$/.exec(e);
  if (m) return <img class="emoji custom" src={emojiUrl(m[2])} alt={`:${m[1]}:`} style={{ width: size, height: size }} draggable={false} />;
  return <span class="e">{e}</span>;
}

export function EmojiPicker({ onPick, close }) {
  const [q, setQ] = useState('');
  const [hover, setHover] = useState(null);
  const gridRef = useRef();
  const inputRef = useRef();
  useEffect(() => inputRef.current?.focus(), []);
  const custom = allCustomEmojis();
  const servers = Object.values(S.servers).filter((s) => s.emojis?.length);
  const pick = (val, keep) => {
    pushRecent(val);
    onPick(val);
    if (!keep) close?.();
  };
  const ql = q.toLowerCase().trim();
  const scrollTo = (id) => gridRef.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start' });

  const renderCustom = (e) => {
    const val = `<:${e.name}:${e.id}>`;
    return (
      <button class="pe" onClick={(ev) => pick(val, ev.shiftKey)} onMouseEnter={() => setHover({ label: `:${e.name}:`, sub: e.serverName, val })}>
        <img src={emojiUrl(e.id)} loading="lazy" />
      </button>
    );
  };
  const renderUni = (em) => (
    <button class="pe" onClick={(ev) => pick(em.char, ev.shiftKey)} onMouseEnter={() => setHover({ label: `:${em.names[0]}:`, val: em.char })}>
      {em.char}
    </button>
  );

  return (
    <div class="picker" onMouseDown={(e) => e.stopPropagation()}>
      <div class="ptop">
        <input ref={inputRef} class="input" placeholder="Emoji suchen …" value={q} onInput={(e) => setQ(e.target.value)} style={{ height: 36 }} />
      </div>
      {!ql && (
        <div class="ptabs">
          <button onClick={() => scrollTo('recent')} data-tip="Zuletzt">🕘</button>
          {servers.map((s) => (
            <button onClick={() => scrollTo('s' + s.id)} data-tip={s.name}>
              <ServerIcon server={s} size={24} />
            </button>
          ))}
          {CATEGORIES.map((c) => (
            <button onClick={() => scrollTo(c.name)} data-tip={c.name}>
              {CATEGORY_ICONS[c.name]}
            </button>
          ))}
        </div>
      )}
      <div class="pgrid" ref={gridRef}>
        {ql ? (
          <>
            {custom.filter((e) => e.name.toLowerCase().includes(ql)).map(renderCustom)}
            {CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.names.some((n) => n.includes(ql))).slice(0, 150).map(renderUni)}
          </>
        ) : (
          <>
            <div class="pcat" data-cat="recent">Zuletzt verwendet</div>
            {prefs.recentEmojis.map((e) => (
              <button class="pe" onClick={(ev) => pick(e, ev.shiftKey)} onMouseEnter={() => setHover({ label: NAME_OF.get(e) ? `:${NAME_OF.get(e)}:` : e, val: e })}>
                <EmojiView e={e} size={30} />
              </button>
            ))}
            {servers.map((s) => (
              <>
                <div class="pcat" data-cat={'s' + s.id}>
                  {s.name}
                </div>
                {s.emojis.map((e) => renderCustom({ ...e, serverName: s.name }))}
              </>
            ))}
            {CATEGORIES.map((c) => (
              <>
                <div class="pcat" data-cat={c.name}>
                  {c.name}
                </div>
                {c.emojis.map(renderUni)}
              </>
            ))}
          </>
        )}
      </div>
      <div class="pfoot">
        {hover ? (
          <>
            <EmojiView e={hover.val} size={24} />
            <span class="grow ellipsis">{hover.label}</span>
            {hover.sub && <span class="muted">{hover.sub}</span>}
          </>
        ) : (
          <span class="muted">Shift+Klick wählt mehrere aus</span>
        )}
      </div>
    </div>
  );
}

export function SoundboardPicker({ onPlay }) {
  const sounds = allSounds();
  const servers = Object.values(S.servers).filter((s) => s.sounds?.length);
  return (
    <div class="picker" style={{ height: 'auto', maxHeight: 440 }} onMouseDown={(e) => e.stopPropagation()}>
      <div class="ptop" style={{ fontWeight: 800 }}>
        <Icon name="soundboard" size={18} /> Klangbox
      </div>
      <div class="pgrid" style={{ padding: 10 }}>
        {!sounds.length && <div class="hint" style={{ padding: 20, textAlign: 'center' }}>Noch keine Sounds. Lade welche in den Server-Einstellungen → Klangbox hoch.</div>}
        {servers.map((s) => (
          <>
            <div class="pcat">{s.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {s.sounds.map((x) => (
                <button class="btn ghost sm" style={{ justifyContent: 'flex-start', overflow: 'hidden' }} onClick={() => onPlay(x)}>
                  <span>{x.emoji || '🔊'}</span>
                  <span class="ellipsis">{x.name}</span>
                </button>
              ))}
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
