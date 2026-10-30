// Clips: nimmt im Hintergrund laufend den Bildschirm (mit Ton) auf und behält nur die letzten Sekunden.
// Auf Knopfdruck, per Tastenkürzel oder Sprachbefehl werden sie als .webm-Datei auf dem PC gespeichert.
import { S, update, prefs, toast } from './store';
import { isElectron, upload, sendMessage } from './api';
import { V } from './voice';
import { sfx } from './sounds';
import { GAME, initGames } from './games';
import { concat, findHeaderEnd, makeClip } from './webmclip';

export const CLIP_QUALITY = {
  '720p30': { label: '720p · 30 FPS', w: 1280, h: 720, fps: 30, br: 5_000_000 },
  '1080p30': { label: '1080p · 30 FPS', w: 1920, h: 1080, fps: 30, br: 8_000_000 },
  '1080p60': { label: '1080p · 60 FPS', w: 1920, h: 1080, fps: 60, br: 12_000_000 },
  '1440p60': { label: '1440p · 60 FPS', w: 2560, h: 1440, fps: 60, br: 20_000_000 },
};
export const CLIP_LENGTHS = [15, 30, 60, 120];
export const CLIP_HOTKEYS = [
  ['Alt+F10', ['Alt', 'F10']],
  ['Alt+F9', ['Alt', 'F9']],
  ['F8', ['F8']],
  ['CommandOrControl+Alt+C', ['Strg', 'Alt', 'C']],
  ['CommandOrControl+Shift+X', ['Strg', 'Umschalt', 'X']],
];
export const CLIPS_SUPPORTED = isElectron && !!window.nook?.clips && typeof MediaRecorder !== 'undefined';

// Zustand für die Oberfläche
export const CLIP = { state: 'off', error: '', saving: false, last: null, voice: { state: 'off' }, hotkeyOk: true };

const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

let rec = null; // { recorder, stream, ctx, dest, header, head, chunks, chain, waiters, micSrc, micTrack }
let restartTimer = null;
let starting = false;

const wanted = () => CLIPS_SUPPORTED && prefs.clipsOn !== false && (prefs.clipWhen === 'always' || !!GAME.current);

function set(state, error = '') {
  CLIP.state = state;
  CLIP.error = error;
  update();
}

// Aufnahme an- oder ausschalten, je nach Einstellungen und laufendem Spiel
export function syncClips() {
  if (wanted()) {
    if (!rec && !starting) start();
    else if (rec && rec.quality !== prefs.clipQuality) restart();
  } else if (rec || starting) stop();
  else if (CLIP.state !== 'off' && CLIP.state !== 'error') set('off');
}

function restart() {
  stop(true);
  clearTimeout(restartTimer);
  restartTimer = setTimeout(syncClips, 500);
}

async function start() {
  starting = true;
  set('starting');
  const qKey = CLIP_QUALITY[prefs.clipQuality] ? prefs.clipQuality : '1080p30';
  const q = CLIP_QUALITY[qKey];
  let stream;
  try {
    const src = await window.nook.clips.prepare();
    if (!src) throw new Error('Kein Bildschirm gefunden');
    // kleiner als der Bildschirm aufnehmen, wenn die Qualität es so will (Seitenverhältnis bleibt)
    const k = Math.min(1, q.w / src.width, q.h / src.height);
    const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.sourceId, maxWidth: Math.round(src.width * k), maxHeight: Math.round(src.height * k), maxFrameRate: q.fps } };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: src.audio ? { mandatory: { chromeMediaSource: 'desktop' } } : false });
    } catch (e) {
      if (!src.audio) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
  } catch (e) {
    starting = false;
    set('error', 'Bildschirm-Aufnahme nicht erlaubt: ' + (e.message || e.name));
    return;
  }
  starting = false;
  if (!wanted()) {
    stream.getTracks().forEach((t) => t.stop());
    return set('off');
  }
  const vt = stream.getVideoTracks()[0];
  vt.contentHint = 'motion';
  // Ton mischen: Systemton (Spiel, Freunde im Anruf) + auf Wunsch die eigene Stimme aus dem Anruf
  const ctx = new AudioContext({ sampleRate: 48000 });
  const dest = ctx.createMediaStreamDestination();
  // stille Dauerquelle: ohne Eingang liefert die Tonspur keine Daten – und der Recorder würde ewig darauf warten
  const silence = ctx.createConstantSource();
  silence.offset.value = 0;
  silence.connect(dest);
  silence.start();
  if (stream.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest);
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(new MediaStream([vt, ...dest.stream.getAudioTracks()]), {
    mimeType: mime,
    videoBitsPerSecond: q.br,
    audioBitsPerSecond: 160_000,
    // jede Sekunde ein Keyframe: der Clip kann so sekundengenau beginnen
    videoKeyFrameIntervalDuration: 1000,
  });
  const r = { recorder, stream, ctx, dest, quality: qKey, header: null, head: new Uint8Array(0), chunks: [], chain: Promise.resolve(), waiters: [], startedAt: Date.now() };
  rec = r;
  recorder.ondataavailable = (e) => {
    r.chain = r.chain.then(async () => {
      let u = new Uint8Array(await e.data.arrayBuffer());
      if (!r.header) {
        r.head = concat([r.head, u]);
        const i = findHeaderEnd(r.head);
        if (i < 0) return;
        r.header = r.head.slice(0, i);
        u = r.head.slice(i);
        r.head = null;
      }
      const now = performance.now();
      r.chunks.push({ t: now, u });
      // nur so viel behalten, wie ein Clip braucht (+ etwas Reserve für den Keyframe davor)
      const keep = (Number(prefs.clipLength) || 30) * 1000 + 4000;
      while (r.chunks.length > 1 && now - r.chunks[0].t > keep) r.chunks.shift();
    });
    r.chain.then(() => {
      const w = r.waiters;
      r.waiters = [];
      w.forEach((f) => f());
    });
  };
  recorder.onerror = () => restart();
  vt.onended = () => {
    // Bildschirm gewechselt/getrennt: neu starten, wenn noch gewünscht
    if (rec === r) restart();
  };
  recorder.start(1000);
  syncMic();
  set('rec');
}

export function stop(quiet = false) {
  const r = rec;
  rec = null;
  if (r) {
    try {
      r.recorder.state !== 'inactive' && r.recorder.stop();
    } catch {}
    r.stream.getTracks().forEach((t) => t.stop());
    r.micSrc?.disconnect();
    r.ctx.close().catch(() => {});
  }
  if (!quiet) set('off');
}

// eigene Stimme aus dem Anruf in den Clip mischen (nur solange man in einem Anruf ist)
function syncMic() {
  const r = rec;
  if (!r) return;
  const track = prefs.clipMic !== false && V.channelId && V.micTrack && V.micTrack.readyState === 'live' ? V.micTrack : null;
  if (track === r.micTrack) return;
  r.micSrc?.disconnect();
  r.micSrc = null;
  r.micTrack = track;
  if (track) {
    r.micSrc = r.ctx.createMediaStreamSource(new MediaStream([track]));
    r.micSrc.connect(r.dest);
  }
}

const pad = (n) => String(n).padStart(2, '0');
function clipName() {
  const d = new Date();
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${GAME.current?.name || 'Nook'} ${when}`;
}

// die letzten Sekunden speichern
export async function saveClip(via = 'button') {
  if (!CLIPS_SUPPORTED) return;
  const r = rec;
  if (!r || !r.header) {
    sfx('streamStop');
    const msg =
      prefs.clipsOn === false
        ? 'Clips sind ausgeschaltet (Einstellungen → Spiele & Clips)'
        : CLIP.state === 'error'
          ? CLIP.error
          : prefs.clipWhen !== 'always' && !GAME.current
            ? 'Clips laufen nur während eines Spiels – oder stell auf „Immer“'
            : 'Die Aufnahme startet gerade, gleich nochmal versuchen';
    notifyOrToast('Kein Clip gespeichert', msg, 'error');
    return;
  }
  if (CLIP.saving) return;
  CLIP.saving = true;
  update();
  try {
    // alles bis jetzt aus dem Recorder holen
    await new Promise((res) => {
      r.waiters.push(res);
      try {
        r.recorder.requestData();
      } catch {
        res();
      }
      setTimeout(res, 1500);
    });
    await r.chain;
    const data = concat(r.chunks.map((c) => c.u));
    const { bytes, durationMs } = makeClip(r.header, data, (Number(prefs.clipLength) || 30) * 1000);
    const file = await window.nook.clips.save(bytes, clipName());
    CLIP.last = { path: file, name: file.split(/[\\/]/).pop(), size: bytes.length, duration: durationMs, at: Date.now() };
    sfx('streamStart');
    notifyOrToast('Clip gespeichert 🎬', `${Math.round(durationMs / 1000)} Sekunden${GAME.current ? ' aus ' + GAME.current.name : ''}${via === 'voice' ? ' (per Sprachbefehl)' : ''}`, 'success');
  } catch (e) {
    notifyOrToast('Clip fehlgeschlagen', e.message, 'error');
  }
  CLIP.saving = false;
  update();
}

// mitten im Spiel sieht man Nook nicht – dann als Windows-/Mac-Benachrichtigung
function notifyOrToast(title, body, kind) {
  if (!document.hasFocus() && window.nook?.notify) window.nook.notify({ title, body, tag: 'nook-clip' });
  else toast(`${title} – ${body}`, kind, 4500);
}

// Clip-Datei in einen Chat schicken
export async function shareClip(path, channelId) {
  const buf = await window.nook.clips.read(path);
  if (!buf) return toast('Clip nicht gefunden', 'error');
  const name = path.split(/[\\/]/).pop();
  const file = new File([buf], name, { type: 'video/webm' });
  toast('Clip wird hochgeladen …', 'info');
  try {
    const r = await upload(file);
    await sendMessage(channelId, { content: '', attachments: [r] });
    toast('Clip geteilt', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function applyClipHotkey() {
  if (!CLIPS_SUPPORTED) return;
  CLIP.hotkeyOk = await window.nook.clips.hotkey(prefs.clipsOn !== false ? prefs.clipHotkey || 'Alt+F10' : '');
  update();
}

export async function applyClipVoice() {
  if (!CLIPS_SUPPORTED) return;
  CLIP.voice = await window.nook.clips.voice(prefs.clipsOn !== false && !!prefs.clipVoice);
  update();
}

export function initClips() {
  if (!CLIPS_SUPPORTED) {
    initGames();
    return;
  }
  initGames(() => syncClips());
  window.nook.on('clip-voice', (s) => {
    CLIP.voice = { ...CLIP.voice, ...s };
    update();
  });
  window.nook.on('hotkey', (k, o) => k === 'clip' && saveClip(o?.voice ? 'voice' : 'hotkey'));
  applyClipHotkey();
  applyClipVoice();
  syncClips();
  // Mikro des Anrufs kommt und geht
  setInterval(syncMic, 2000);
}
