// Sicherer Markdown-Renderer: erst alles escapen, dann nur bekannte Muster in HTML umwandeln.
import { S } from './store';
import { displayName, emojiUrl, roleColor } from './api';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|class|import|from|export|new|true|false|null|undefined|def|print|async|await|try|catch|public|private|static|void|int|string|bool|fn|struct|impl|use|mut|self|this|in|of|switch|case|break|continue)\b/g;

function highlight(code) {
  // sehr einfacher Highlighter: Strings, Kommentare, Zahlen, Schlüsselwörter
  const parts = [];
  const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|\b\d+(?:\.\d+)?\b)/g;
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    parts.push(esc(code.slice(last, m.index)).replace(KEYWORDS, '<span class="hl-k">$1</span>'));
    const t = m[0];
    const cls = /^["'`]/.test(t) ? 'hl-s' : /^(\/\/|#|\/\*)/.test(t) ? 'hl-c' : 'hl-n';
    parts.push(`<span class="${cls}">${esc(t)}</span>`);
    last = m.index + t.length;
  }
  parts.push(esc(code.slice(last)).replace(KEYWORDS, '<span class="hl-k">$1</span>'));
  return parts.join('');
}

function fmtTimestamp(unix, style) {
  const d = new Date(unix * 1000);
  const opts = {
    t: { hour: '2-digit', minute: '2-digit' },
    T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
    d: { day: '2-digit', month: '2-digit', year: 'numeric' },
    D: { day: 'numeric', month: 'long', year: 'numeric' },
    f: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    F: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  };
  if (style === 'R') {
    const diff = (d - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 2592000) return rtf.format(Math.round(diff / 86400), 'day');
    if (abs < 31536000) return rtf.format(Math.round(diff / 2592000), 'month');
    return rtf.format(Math.round(diff / 31536000), 'year');
  }
  return d.toLocaleString('de-DE', opts[style] || opts.f);
}

const cache = new Map();

export function renderMarkdown(src, { serverId = null, inline = false } = {}) {
  const key = (serverId || '') + '|' + (inline ? 1 : 0) + '|' + src;
  if (cache.has(key)) return cache.get(key);
  const html = render(src || '', serverId, inline);
  if (cache.size > 3000) cache.clear();
  cache.set(key, html);
  return html;
}

export function clearMarkdownCache() {
  cache.clear();
}

function render(src, serverId, inline) {
  const tokens = [];
  const hold = (html) => `\u0000${tokens.push(html) - 1}\u0000`;

  // Code-Blöcke
  src = src.replace(/```(?:([\w+#-]{1,20})\n)?([\s\S]*?)```/g, (_, lang, code) => {
    code = code.replace(/^\n+|\n+$/g, '');
    return hold(`<pre class="codeblock"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${highlight(code)}</code></pre>`);
  });
  // Inline-Code
  src = src.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(`<code class="inline">${esc(code)}</code>`));
  // Maskierte Links
  src = src.replace(/\[([^\]\n]{1,200})\]\(<?(https?:\/\/[^\s)>]+)>?\)/g, (_, text, url) => hold(`<a href="${esc(url)}" class="link" title="${esc(url)}">${inlineFmt(esc(text))}</a>`));
  // Nackte Links
  src = src.replace(/<?(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?>])>?/g, (_, url) => hold(`<a href="${esc(url)}" class="link">${esc(url)}</a>`));

  let out = esc(src);

  // Mentions & Spezial-Syntax
  out = out.replace(/&lt;@(\w+)&gt;/g, (_, id) => {
    const color = serverId ? roleColor(id, serverId) : '';
    return hold(`<span class="mention" data-user="${id}"${color ? ` style="--mc:${color}"` : ''}>@${esc(displayName(id, serverId))}</span>`);
  });
  out = out.replace(/&lt;@&amp;(\w+)&gt;/g, (_, id) => {
    const role = Object.values(S.servers).flatMap((s) => s.roles).find((r) => r.id === id);
    return hold(`<span class="mention role" style="--mc:${role?.color || 'var(--accent)'}">@${esc(role?.name || 'gelöschte-rolle')}</span>`);
  });
  out = out.replace(/&lt;#(\w+)&gt;/g, (_, id) => {
    const ch = S.channels[id];
    return hold(`<span class="mention channel" data-channel="${id}">#${esc(ch?.name || 'unbekannt')}</span>`);
  });
  out = out.replace(/&lt;a?:(\w+):([\w.]+)&gt;/g, (_, name, id) => hold(`<img class="emoji custom" src="${esc(emojiUrl(id))}" alt=":${name}:" title=":${name}:" draggable="false">`));
  out = out.replace(/&lt;t:(-?\d+)(?::([tTdDfFR]))?&gt;/g, (_, unix, style) => hold(`<span class="timestamp" title="${esc(fmtTimestamp(+unix, 'F'))}">${esc(fmtTimestamp(+unix, style || 'f'))}</span>`));
  out = out.replace(/@(everyone|here)\b/g, (_, w) => hold(`<span class="mention">@${w}</span>`));

  if (inline) {
    out = inlineFmt(out.replace(/\n/g, ' '));
  } else {
    out = blockFmt(out);
  }

  // Platzhalter zurücksetzen (mehrfach, da verschachtelt)
  for (let i = 0; i < 3 && out.includes('\u0000'); i++) out = out.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[n]);
  return out;
}

function inlineFmt(s) {
  return s
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>')
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
}

function blockFmt(s) {
  const lines = s.split('\n');
  const out = [];
  let quote = [];
  let list = null;
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map(inlineFmt).join('<br>')}</blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineFmt(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  let multiQuote = false;
  for (const line of lines) {
    if (multiQuote) {
      quote.push(line);
      continue;
    }
    if (line.startsWith('&gt;&gt;&gt; ')) {
      flushList();
      multiQuote = true;
      quote.push(line.slice(13));
      continue;
    }
    if (line.startsWith('&gt; ') || line === '&gt;') {
      flushList();
      quote.push(line.slice(5));
      continue;
    }
    flushQuote();
    let m;
    if ((m = line.match(/^\s*[-*] (.+)/))) {
      if (list?.tag !== 'ul') flushList();
      list = list || { tag: 'ul', items: [] };
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+\. (.+)/))) {
      if (list?.tag !== 'ol') flushList();
      list = list || { tag: 'ol', items: [] };
      list.items.push(m[1]);
      continue;
    }
    flushList();
    if ((m = line.match(/^(#{1,3}) (.+)/))) {
      out.push(`<h${m[1].length + 2} class="md-h">${inlineFmt(m[2])}</h${m[1].length + 2}>`);
      continue;
    }
    if ((m = line.match(/^-# (.+)/))) {
      out.push(`<div class="subtext">${inlineFmt(m[1])}</div>`);
      continue;
    }
    out.push(inlineFmt(line) + '\n');
  }
  flushQuote();
  flushList();
  return out.join('').replace(/\n$/, '').replace(/\n/g, '<br>');
}

// Nur Emojis (für große Darstellung)?
const EMOJI_ONLY = /^(?:\s|<a?:\w+:[\w.]+>|\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️)+$/u;
export function isEmojiOnly(text) {
  if (!text || text.length > 120) return false;
  if (!EMOJI_ONLY.test(text)) return false;
  if (/^[\d#*\s]+$/.test(text)) return false;
  const count = (text.match(/<a?:\w+:[\w.]+>|\p{Extended_Pictographic}/gu) || []).length;
  return count > 0 && count <= 27;
}

export function extractUrls(text) {
  const noCode = (text || '').replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const urls = [];
  for (const m of noCode.matchAll(/(<)?(https?:\/\/[^\s<>]+[^\s<>.,:;"')\]!?])(>)?/g)) {
    if (m[1] && m[3]) continue; // <url> = Vorschau unterdrückt
    if (!urls.includes(m[2])) urls.push(m[2]);
  }
  return urls.slice(0, 5);
}
