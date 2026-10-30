// WebRTC-Mesh: jeder ist mit jedem direkt verbunden (ideal für Freundesgruppen bis ~10 Personen).
// Bildschirm-Streams werden nur an Leute geschickt, die auf "Ansehen" klicken – spart Bandbreite.
import { S, update, prefs, setPref, toast } from './store';
import { rpc, bindVoice, fileUrl, displayName, serverIdOf, channelTitle, allSounds } from './api';
import { sfx, stopRing } from './sounds';
import { NC } from './native';

export const QUALITY = {
  '720p30': { label: '720p · 30 FPS', w: 1280, h: 720, fps: 30, br: 4_000_000 },
  '720p60': { label: '720p · 60 FPS', w: 1280, h: 720, fps: 60, br: 6_000_000 },
  '1080p30': { label: '1080p · 30 FPS', w: 1920, h: 1080, fps: 30, br: 8_000_000 },
  '1080p60': { label: '1080p · 60 FPS', w: 1920, h: 1080, fps: 60, br: 12_000_000 },
  '1440p60': { label: '1440p · 60 FPS', w: 2560, h: 1440, fps: 60, br: 20_000_000 },
  '4k60': { label: '4K · 60 FPS', w: 3840, h: 2160, fps: 60, br: 35_000_000 },
  '4k120': { label: '4K · 120 FPS', w: 3840, h: 2160, fps: 120, br: 50_000_000 },
  source: { label: 'Quellauflösung · 60 FPS', w: 0, h: 0, fps: 60, br: 40_000_000 },
};

// Handy (iPhone-App, Handy-Browser): andere Kamera-Einstellungen, kein Bildschirm teilen
export const IS_PHONE = location.protocol === 'capacitor:' || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const CAN_SHARE_SCREEN = !!navigator.mediaDevices?.getDisplayMedia && !IS_PHONE;
// iPhone-App mit nativer Sprach-Erweiterung: Mikro und Ton laufen dort auch bei gesperrtem Bildschirm weiter.
// Die Sprache geht dann über eine eigene Verbindung („Spur a“), Kamera und Streams wie bisher über die Web-Ansicht.
export const NATIVE_CALL = !!NC;

export const CAMERA_QUALITY = {
  '480p': { w: 854, h: 480, fps: 30, br: 1_000_000 },
  '720p': { w: 1280, h: 720, fps: 30, br: 2_500_000 },
  '1080p': { w: 1920, h: 1080, fps: 30, br: 4_500_000 },
  '1080p60': { w: 1920, h: 1080, fps: 60, br: 7_000_000 },
};

function dbFromAnalyser(an, buf) {
  an.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// Codec-Reihenfolge: Bewegung (Spiele, Videos) -> H264, meist mit Hardware-Encoder;
// Details (Text, Code) -> VP9, bleibt bei wenig Bandbreite deutlich schärfer
function preferCodecs(transceiver, kind, content = 'motion') {
  try {
    const caps = RTCRtpReceiver.getCapabilities(kind)?.codecs;
    if (!caps || !transceiver.setCodecPreferences) return;
    const order = kind !== 'video' ? ['audio/opus'] : content === 'detail' ? ['video/VP9', 'video/H264', 'video/AV1', 'video/VP8'] : ['video/H264', 'video/VP9', 'video/AV1', 'video/VP8'];
    const sorted = [...caps].sort((a, b) => {
      const ia = order.indexOf(a.mimeType);
      const ib = order.indexOf(b.mimeType);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    transceiver.setCodecPreferences(sorted);
  } catch {}
}

// Name des Standard-Mikrofons (zum Erkennen, ob das System auf ein anderes Headset gewechselt hat)
async function defaultInputLabel() {
  const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return devs.find((d) => d.kind === 'audioinput' && d.deviceId === 'default')?.label || '';
}

class VoiceEngine {
  constructor() {
    this.channelId = null;
    this.serverId = null;
    this.peers = new Map();
    this.remote = {}; // uid -> { mic, camera, screen }
    this.audioNodes = {}; // key -> nodes
    this.muted = false;
    this.deafened = false;
    this.camStream = null;
    this.screenStream = null;
    this.screenQ = null;
    this.watching = new Set();
    this.viewers = new Set();
    this.speaking = new Set();
    this.selfLevel = -100;
    this.pttDown = false;
    this.gateOpenUntil = 0;
    this.ping = null;
    this.soundCache = new Map();
    this.soundFx = []; // { userId, emoji, at }
    this.joining = false;
    this.focus = null;
    this.screenStats = {}; // uid -> { w, h, fps, kbps } für angesehene Streams
    this.buf = new Float32Array(512);
    this.apeers = new Map(); // uid -> { pc } Sprachverbindungen zu iPhones mit nativer Erweiterung
    this.nstate = {}; // uid -> 'connected' | 'failed' | 'disconnected' (nur iPhone-App)
    this.laneQ = {};
    if (NC) {
      NC.addListener('signal', (d) => {
        if (!this.channelId || !d?.uid) return;
        if (d.desc) this.signal(d.uid, { lane: 'a', desc: d.desc, fresh: !!d.fresh });
        else if (d.cand) this.signal(d.uid, { lane: 'a', cand: d.cand });
      });
      // Zustand der nativen Sprachverbindungen (für die Anzeige im Anruf)
      NC.addListener('state', (d) => {
        if (d?.uid) this.nstate[d.uid] = d.state;
        update();
      });
      // Auflegen / Stummschalten über die iOS-Anrufanzeige (Dynamic Island, Sperrbildschirm)
      NC.addListener('hangup', () => this.channelId && this.leave());
      NC.addListener('muted', (d) => {
        if (!this.channelId) return;
        this.muted = !!d?.muted;
        if (!this.muted) this.deafened = false;
        this.pushState();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (prefs.inputMode === 'ptt' && e.code === prefs.pttKey && !e.repeat && !isTyping(e)) {
        this.pttDown = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === prefs.pttKey && this.pttDown) {
        setTimeout(() => (this.pttDown = false), prefs.pttDelay);
      }
    });
    window.addEventListener('blur', () => (this.pttDown = false));
    // Headset im Anruf an- oder abgesteckt -> Mikrofon/Ausgabe neu zuordnen
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.onDeviceChange());
    // iPhone: Nach dem Entsperren / Zurückkehren in die App pausiert iOS Mikro, Kamera und Ton –
    // hier wird alles wieder angeworfen, damit der Anruf ohne Neu-Beitreten weiterläuft
    const wake = () => document.visibilityState === 'visible' && this.wake();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
  }

  async wake() {
    if (!this.channelId || (!this.ctx && !NC) || this.waking) return;
    this.waking = true;
    try {
      if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
      const mic = this.micRaw?.getAudioTracks()[0];
      if (!NATIVE_CALL && (!mic || mic.readyState === 'ended' || mic.muted)) await this.startMic();
      const cam = this.camStream?.getVideoTracks()[0];
      if (cam && (cam.readyState === 'ended' || cam.muted)) await this.restartCamera();
      // Hängengebliebene Verbindungen neu aufbauen
      if ([...this.peers.values()].some((p) => ['failed', 'closed'].includes(p.pc.connectionState))) await this.rejoin();
    } finally {
      this.waking = false;
      update();
    }
  }

  get connected() {
    return !!this.channelId;
  }

  // ---------- Beitreten / Verlassen ----------
  async join(channelId) {
    if (this.joining) return;
    if (this.channelId === channelId) return;
    this.joining = true;
    try {
      if (this.channelId) await this.leave(true);
      stopRing();
      await this.setupAudio();
      if (NC) {
        this.nstate = {};
        this.joinedAt = Date.now();
        await NC.start({ iceServers: S.iceServers || [], muted: this.muted, deafened: this.deafened, name: channelTitle(S.channels[channelId]) || 'Nook' });
      }
      else if (location.protocol === 'capacitor:') toast('Diese App-Version hat noch keine nativen Anrufe – beim Sperren geht der Ton aus. Bitte neueste iPhone-App installieren.', 'error', 8000);
      const ch = S.channels[channelId];
      this.channelId = channelId;
      this.serverId = serverIdOf(ch);
      const res = await rpc('voiceJoin', { channelId, muted: this.muted, deafened: this.deafened, keepAlive: NATIVE_CALL });
      for (const uid of res.peers) {
        // iPhone (nativ): Die Video-Verbindung hat hier anfangs nichts zu senden und würde nie ausgehandelt –
        // die anderen bauen sie deshalb von ihrer Seite auf
        if (NC) this.signal(uid, { reset: true });
        this.createPeer(uid);
      }
      sfx('join');
      this.startLoops();
    } catch (e) {
      this.channelId = null;
      this.teardownAudio();
      toast(e.message, 'error');
    }
    this.joining = false;
    update();
  }

  async rejoin() {
    const ch = this.channelId;
    if (!ch) return;
    if (NC) return this.rejoinNative(ch);
    for (const uid of [...this.peers.keys()]) this.closePeer(uid);
    try {
      const res = await rpc('voiceJoin', { channelId: ch, muted: this.muted, deafened: this.deafened });
      if (this.camStream) await rpc('voiceUpdate', { video: true, cameraStreamId: this.camStream.id });
      if (this.screenStream) await rpc('voiceUpdate', { screenStreamId: this.screenStream.id, screenInfo: this.screenInfo });
      for (const uid of res.peers) this.createPeer(uid);
    } catch {
      this.leave(true);
    }
  }

  // Anruf-Diagnose (iPhone-App): Zustand der nativen Erweiterung als Text
  async diagnose() {
    const lines = [`Native Anruf-Technik: ${NC ? 'aktiv ✅' : 'NICHT aktiv ❌ (alte App-Version?)'}`, `Im Anruf: ${this.channelId ? 'ja' : 'nein'}`, `Video-Verbindungen: ${[...this.peers.values()].map((p) => p.pc.connectionState).join(', ') || '–'}`];
    if (NC) {
      try {
        const st = await NC.status();
        if (st.callKit) lines.push(`iOS-Anruf (CallKit): ${st.callKit}`);
        const login = await NC.loadLogin().catch(() => null);
        lines.push(`Angemeldet bleiben (Schlüsselbund): ${login?.token ? 'gespeichert ✅' : 'nicht gespeichert ❌'}`);
        lines.push(`Ton-Sitzung: ${st.category} / ${st.mode} · aktiv: ${st.active ? 'ja' : 'nein'} · Ausgabe: ${st.route}`);
        lines.push(`Sprach-Verbindungen: ${Object.entries(st.peers || {}).map(([u, v]) => `${S.users[u]?.displayName || u}: ${v}`).join(', ') || '–'}`);
        lines.push('', 'Protokoll:', ...(st.log || []).slice(-15));
      } catch (e) {
        lines.push('Status nicht abrufbar (App zu alt): ' + (e.message || e));
      }
    }
    return lines.join('\n');
  }

  // iPhone nach dem Entsperren: Die Sprache (nativ) lief weiter – nur die Video-Verbindungen neu aufbauen
  async rejoinNative(ch, attempt = 0) {
    if (this.channelId !== ch) return;
    for (const uid of [...this.peers.keys()]) this.closeMainPeer(uid);
    try {
      const res = await rpc('voiceJoin', { channelId: ch, muted: this.muted, deafened: this.deafened, keepAlive: true, resume: true });
      if (this.camStream) await rpc('voiceUpdate', { video: true, cameraStreamId: this.camStream.id });
      const { uids = [] } = await NC.listPeers().catch(() => ({}));
      // Server hatte uns schon aus dem Kanal genommen -> die anderen haben ihre Ton-Verbindung zu uns geschlossen,
      // also auch die eigenen neu aufbauen
      for (const uid of uids) if (!res.resumed || !res.peers.includes(uid)) NC.closePeer({ uid }).catch(() => {});
      for (const uid of res.peers) {
        this.signal(uid, { reset: true });
        this.createPeer(uid);
      }
    } catch {
      // Im Hintergrund klappt das oft nicht sofort – nie auflegen, der Ton läuft nativ weiter. Später erneut versuchen.
      if (attempt < 20) setTimeout(() => this.rejoinNative(ch, attempt + 1), Math.min(15000, 2000 * (attempt + 1)));
    }
  }

  async leave(silent = false) {
    if (!this.channelId) return;
    const was = this.channelId;
    this.channelId = null;
    this.serverId = null;
    rpc('voiceLeave', { channelId: was }).catch(() => {});
    for (const uid of [...this.peers.keys()]) this.closePeer(uid);
    this.camStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.camStream = null;
    this.screenStream = null;
    this.watching.clear();
    this.viewers.clear();
    this.speaking.clear();
    this.focus = null;
    this.stopLoops();
    this.teardownAudio();
    NC?.stop().catch(() => {});
    if (!silent) sfx('leave');
    else sfx('hangup');
    update();
    if (S.uiUpdate && S.uiUpdate !== window.__NOOK_UI_V) import('./api').then((m) => m.reloadForUpdate());
  }

  // ---------- Audio-Graph ----------
  async setupAudio() {
    // iPhone mit nativer Erweiterung: Die Web-Ansicht fasst während des Anrufs keinen Ton an – iOS schaltet
    // Web-Audio beim Sperren/Minimieren ab und reißt dabei sonst die native Tonverbindung mit
    if (NATIVE_CALL) {
      this.ctx = null;
      this.micTrack = null;
      this.sendStream = null;
      return;
    }
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    if (prefs.outputDevice && this.ctx.setSinkId) await this.ctx.setSinkId(prefs.outputDevice).catch(() => {});
    this.master = this.ctx.createGain();
    this.master.gain.value = this.deafened ? 0 : prefs.outputVolume;
    this.master.connect(this.ctx.destination);
    this.inGain = this.ctx.createGain();
    this.inGain.gain.value = prefs.inputVolume;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.gate = this.ctx.createGain();
    this.gate.gain.value = 0;
    this.dest = this.ctx.createMediaStreamDestination();
    this.inGain.connect(this.analyser);
    this.inGain.connect(this.gate);
    this.gate.connect(this.dest);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.dest);
    this.sfxGain.connect(this.master);
    this.sendStream = this.dest.stream;
    this.micTrack = this.sendStream.getAudioTracks()[0];
    // Native Erweiterung nimmt das Mikro selbst auf – die Web-Ansicht darf es dann nicht zusätzlich öffnen
    if (!NATIVE_CALL) await this.startMic();
  }

  async startMic() {
    this.micRaw?.getTracks().forEach((t) => t.stop());
    this.micSrc?.disconnect();
    this.micRaw = null;
    try {
      this.micRaw = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: prefs.inputDevice ? { exact: prefs.inputDevice } : undefined,
          echoCancellation: prefs.echoCancellation,
          noiseSuppression: prefs.noiseSuppression,
          autoGainControl: prefs.autoGain,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
    } catch (e) {
      try {
        this.micRaw = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        toast('Kein Mikrofon gefunden – du kannst nur zuhören', 'error', 5000);
        return;
      }
    }
    this.micSrc = this.ctx.createMediaStreamSource(this.micRaw);
    this.micSrc.connect(this.inGain);
    // Gerät abgezogen -> neu öffnen (fällt dann aufs Standardgerät zurück)
    const track = this.micRaw.getAudioTracks()[0];
    if (track) track.onended = () => this.ctx && this.micRaw?.getAudioTracks()[0] === track && this.startMic();
    this.micDefault = await defaultInputLabel();
  }

  // Geräte haben sich geändert (Headset an/aus): Mikro neu öffnen, wenn es weg ist oder – bei „Standard“ –
  // das Standardgerät gewechselt hat; gewählte Ausgabe neu setzen, sobald sie wieder da ist
  async onDeviceChange() {
    if (!this.ctx || NATIVE_CALL) return;
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const track = this.micRaw?.getAudioTracks()[0];
    const def = devs.find((d) => d.kind === 'audioinput' && d.deviceId === 'default')?.label;
    if (!track || track.readyState === 'ended' || (!prefs.inputDevice && def && def !== this.micDefault)) await this.startMic();
    if (prefs.outputDevice && this.ctx?.setSinkId && devs.some((d) => d.deviceId === prefs.outputDevice)) {
      await this.ctx.setSinkId('').catch(() => {});
      await this.ctx.setSinkId(prefs.outputDevice).catch(() => {});
    }
  }

  teardownAudio() {
    this.micRaw?.getTracks().forEach((t) => t.stop());
    this.micRaw = null;
    for (const k of Object.keys(this.audioNodes)) this.dropAudio(k);
    this.remote = {};
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  applyPrefs() {
    if (!this.ctx) return;
    this.inGain.gain.value = prefs.inputVolume;
    this.master.gain.value = this.deafened ? 0 : prefs.outputVolume;
    if (this.ctx.setSinkId) this.ctx.setSinkId(prefs.outputDevice || '').catch(() => {});
    for (const [key, n] of Object.entries(this.audioNodes)) n.g.gain.value = this.volumeFor(...key.split(':'));
  }

  volumeFor(uid, kind) {
    if (prefs.localMutes[uid]) return 0;
    if (kind === 'screen') return prefs.streamVolumes[uid] ?? 1;
    return prefs.userVolumes[uid] ?? 1;
  }

  setUserVolume(uid, v) {
    prefs.userVolumes[uid] = v;
    setPref('userVolumes', prefs.userVolumes);
    this.applyPrefs();
  }
  setStreamVolume(uid, v) {
    prefs.streamVolumes[uid] = v;
    setPref('streamVolumes', prefs.streamVolumes);
    this.applyPrefs();
  }
  toggleLocalMute(uid) {
    if (prefs.localMutes[uid]) delete prefs.localMutes[uid];
    else prefs.localMutes[uid] = true;
    setPref('localMutes', prefs.localMutes);
    this.applyPrefs();
  }

  // ---------- Loops: Sprachaktivierung, Sprechen-Anzeige, Ping ----------
  startLoops() {
    this.stopLoops();
    this.loop = setInterval(() => this.tick(), 40);
    this.statsLoop = setInterval(() => this.collectStats(), 3000);
  }
  stopLoops() {
    clearInterval(this.loop);
    clearInterval(this.statsLoop);
  }

  isForcedMuted() {
    const vs = S.voice[S.me?.id];
    return !!(vs?.serverMuted || vs?.suppressed);
  }

  tick() {
    if (NC) return this.channelId && this.tickNative();
    if (!this.ctx) return;
    const now = performance.now();
    const lvl = this.micRaw ? dbFromAnalyser(this.analyser, this.buf) : -100;
    this.selfLevel = lvl;
    let open;
    if (prefs.inputMode === 'ptt') open = this.pttDown;
    else {
      const thr = prefs.vadAuto ? -58 : prefs.vadThreshold;
      if (lvl > thr) this.gateOpenUntil = now + 280;
      open = now < this.gateOpenUntil;
    }
    const live = open && !this.muted && !this.deafened && !this.isForcedMuted();
    this.gate.gain.setTargetAtTime(live ? 1 : 0, this.ctx.currentTime, 0.012);
    const changed = new Set();
    const me = S.me.id;
    if (live !== this.speaking.has(me)) {
      live ? this.speaking.add(me) : this.speaking.delete(me);
      changed.add(me);
    }
    for (const [key, n] of Object.entries(this.audioNodes)) {
      if (!key.endsWith(':mic')) continue;
      const uid = key.split(':')[0];
      const l = dbFromAnalyser(n.an, this.buf);
      const sp = l > -52 && !prefs.localMutes[uid];
      if (sp) n.until = now + 250;
      const on = now < (n.until || 0);
      if (on !== this.speaking.has(uid)) {
        on ? this.speaking.add(uid) : this.speaking.delete(uid);
        changed.add(uid);
      }
    }
    if (changed.size) update();
  }

  // Sprechen-Anzeige mit der nativen Erweiterung (Pegel kommen von dort)
  async tickNative() {
    const now = performance.now();
    if (this.levelBusy || now - (this.levelAt || 0) < 250) return;
    this.levelBusy = true;
    this.levelAt = now;
    try {
      const { me = 0, peers = {} } = await NC.levels();
      const changed = new Set();
      const set = (uid, on) => {
        if (on === this.speaking.has(uid)) return;
        on ? this.speaking.add(uid) : this.speaking.delete(uid);
        changed.add(uid);
      };
      this.selfLevel = me > 0 ? 20 * Math.log10(me) : -100;
      set(S.me.id, me > 0.02 && !this.muted && !this.deafened && !this.isForcedMuted());
      for (const [uid, l] of Object.entries(peers)) set(uid, l > 0.015 && !prefs.localMutes[uid]);
      if (changed.size) update();
    } catch {}
    this.levelBusy = false;
  }

  async collectStats() {
    let total = 0;
    let n = 0;
    for (const p of this.peers.values()) {
      try {
        const stats = await p.pc.getStats();
        const screenTrack = this.remote[p.uid]?.screen?.getVideoTracks()[0]?.id;
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && r.currentRoundTripTime != null) {
            total += r.currentRoundTripTime * 1000;
            n++;
          }
          // Auflösung, FPS und Datenrate des angesehenen Streams (für die Anzeige in der Kachel)
          if (screenTrack && r.type === 'inbound-rtp' && r.kind === 'video' && r.trackIdentifier === screenTrack) {
            const prev = this.screenStats[p.uid];
            const dt = prev && r.timestamp > prev.ts ? r.timestamp - prev.ts : 0;
            const kbps = dt && prev.bytes != null ? Math.round(((r.bytesReceived - prev.bytes) * 8) / dt) : 0;
            // FPS aus den wirklich dekodierten Bildern seit der letzten Messung (framesPerSecond fehlt oft oder meldet 0)
            const frames = r.framesDecoded ?? r.framesReceived;
            const fps = dt && frames != null && prev.frames != null ? Math.round(((frames - prev.frames) * 1000) / dt) : Math.round(r.framesPerSecond || 0);
            this.screenStats[p.uid] = { w: r.frameWidth, h: r.frameHeight, fps: Math.max(0, fps), kbps: Math.max(0, kbps), bytes: r.bytesReceived, frames, ts: r.timestamp };
          }
        });
        if (!screenTrack) delete this.screenStats[p.uid];
      } catch {}
    }
    this.ping = n ? Math.round(total / n) : null;
    update();
  }

  // ---------- Peers ----------
  createPeer(uid) {
    if (this.peers.has(uid)) return this.peers.get(uid);
    const pc = new RTCPeerConnection({ iceServers: S.iceServers, bundlePolicy: 'max-bundle' });
    const peer = { uid, pc, polite: S.me.id > uid, makingOffer: false, ignoreOffer: false, cam: [], screen: [] };
    this.peers.set(uid, peer);
    // addTrack (statt addTransceiver), damit der Sender beim Annehmen eines Angebots wiederverwendet wird.
    // iPhone mit nativer Erweiterung: Sprache läuft über eine eigene native Verbindung
    if (NC) NC.createPeer({ uid }).catch(() => {});
    else pc.addTrack(this.micTrack, this.sendStream);
    if (this.camStream) this.addCamTo(peer);
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(uid, { desc: pc.localDescription });
      } catch (e) {
        console.warn('negotiation', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = (e) => e.candidate && this.signal(uid, { cand: e.candidate.toJSON() });
    pc.ontrack = (e) => this.onTrack(uid, e);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      if (pc.connectionState === 'connected') {
        // Studio-Qualität für Sprache (128 kbit/s Opus)
        for (const s of pc.getSenders()) {
          if (s.track !== this.micTrack) continue;
          const p = s.getParameters();
          if (p.encodings?.[0]) {
            p.encodings[0].maxBitrate = 128000;
            s.setParameters(p).catch(() => {});
          }
        }
      }
      update();
    };
    return peer;
  }

  closePeer(uid) {
    this.closeMainPeer(uid);
    this.closeLaneA(uid);
    NC?.closePeer({ uid }).catch(() => {});
    for (const k of Object.keys(this.audioNodes)) if (k.startsWith(uid + ':')) this.dropAudio(k);
    delete this.remote[uid];
    delete this.laneQ[uid];
    this.speaking.delete(uid);
  }

  // Nur die normale Verbindung (Video, Streams, Sprache von PCs) – die native iPhone-Sprache bleibt
  closeMainPeer(uid) {
    const p = this.peers.get(uid);
    if (p) p.pc.close();
    this.peers.delete(uid);
    this.dropAudio(uid + ':screen');
    if (this.remote[uid]) {
      delete this.remote[uid].camera;
      delete this.remote[uid].screen;
    }
    this.watching.delete(uid);
    this.viewers.delete(uid);
    if (this.focus?.uid === uid) this.focus = null;
  }

  // ---------- Spur a: Sprache von/zu einem iPhone mit nativer Erweiterung (das iPhone bietet immer an) ----------
  closeLaneA(uid) {
    const ap = this.apeers.get(uid);
    if (!ap) return;
    clearTimeout(ap.failTimer);
    ap.pc.close();
    this.apeers.delete(uid);
  }

  createLaneA(uid) {
    const pc = new RTCPeerConnection({ iceServers: S.iceServers, bundlePolicy: 'max-bundle' });
    const ap = { pc, failTimer: null };
    this.apeers.set(uid, ap);
    pc.onicecandidate = (e) => e.candidate && this.signal(uid, { lane: 'a', cand: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      if (e.track.kind !== 'audio') return;
      const stream = e.streams[0] || new MediaStream([e.track]);
      const r = (this.remote[uid] = this.remote[uid] || {});
      r.mic = stream;
      this.attachAudio(uid, 'mic', stream);
      update();
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(ap.failTimer);
        ap.failTimer = null;
        for (const s of pc.getSenders()) {
          const p = s.getParameters();
          if (p.encodings?.[0]) {
            p.encodings[0].maxBitrate = 128000;
            s.setParameters(p).catch(() => {});
          }
        }
      }
      // iPhone ist weg (App beendet, kein Netz) und meldet sich nicht mehr beim Server -> aus dem Kanal nehmen
      if ((st === 'failed' || st === 'disconnected') && !ap.failTimer) {
        ap.failTimer = setTimeout(() => {
          ap.failTimer = null;
          if (this.apeers.get(uid) === ap && ['failed', 'disconnected'].includes(pc.connectionState) && S.voice[uid]?.away) rpc('voicePeerLost', { userId: uid }).catch(() => {});
        }, 45000);
      }
      update();
    };
    return ap;
  }

  onLaneA(from, data) {
    const run = async () => {
      if (!this.channelId) return;
      if (data.desc?.type === 'offer') {
        let ap = this.apeers.get(from);
        if (ap && data.fresh) {
          this.closeLaneA(from);
          ap = null;
        }
        if (!ap) ap = this.createLaneA(from);
        await ap.pc.setRemoteDescription(data.desc);
        for (const t of ap.pc.getTransceivers()) {
          if (t.receiver.track?.kind !== 'audio' || t.sender.track === this.micTrack) continue;
          await t.sender.replaceTrack(this.micTrack);
          t.direction = 'sendrecv';
          t.sender.setStreams?.(this.sendStream);
        }
        await ap.pc.setLocalDescription(await ap.pc.createAnswer());
        this.signal(from, { lane: 'a', desc: ap.pc.localDescription });
      } else if (data.desc?.type === 'answer') {
        // iPhone-Seite: Antwort an die native Erweiterung weitergeben
        await NC?.signal({ uid: from, desc: { type: data.desc.type, sdp: data.desc.sdp } });
      } else if (data.cand) {
        if (NC) await NC.signal({ uid: from, cand: data.cand });
        else await this.apeers.get(from)?.pc.addIceCandidate(data.cand).catch(() => {});
      }
    };
    // Signale einer Person der Reihe nach abarbeiten (Kandidaten erst nach dem Angebot)
    this.laneQ[from] = (this.laneQ[from] || Promise.resolve()).then(run).catch((e) => console.warn('spur a', e));
  }

  signal(to, data) {
    rpc('rtc', { to, data }).catch(() => {});
  }

  async onSignal(from, data) {
    if (!this.channelId) return;
    if (data.lane === 'a') return this.onLaneA(from, data);
    // iPhone baut nach dem Entsperren seine Video-Verbindung neu auf
    if (data.reset) {
      this.closeMainPeer(from);
      this.createPeer(from);
      return;
    }
    const peer = this.peers.get(from) || this.createPeer(from);
    const pc = peer.pc;
    try {
      if (data.desc) {
        const offerCollision = data.desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.desc);
        if (data.desc.type === 'offer') {
          await pc.setLocalDescription();
          this.signal(from, { desc: pc.localDescription });
        }
      } else if (data.cand) {
        try {
          await pc.addIceCandidate(data.cand);
        } catch (e) {
          if (!peer.ignoreOffer) console.warn(e);
        }
      } else if (data.watch !== undefined) {
        if (data.watch) {
          this.viewers.add(from);
          if (this.screenStream) this.addScreenTo(peer);
        } else {
          this.viewers.delete(from);
          this.removeSenders(peer, 'screen');
          this.tuneScreenSenders();
        }
        update();
      }
    } catch (e) {
      console.warn('signal', e);
    }
  }

  onTrack(uid, e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    const vs = S.voice[uid];
    let kind = 'mic';
    if (vs?.screenStreamId && vs.screenStreamId === stream.id) kind = 'screen';
    else if (vs?.cameraStreamId && vs.cameraStreamId === stream.id) kind = 'camera';
    else if (e.track.kind === 'video') kind = vs?.screenStreamId && this.watching.has(uid) && !vs.cameraStreamId ? 'screen' : 'camera';
    const r = (this.remote[uid] = this.remote[uid] || {});
    r[kind] = stream;
    if (e.track.kind === 'audio' && !(NC && kind === 'mic')) this.attachAudio(uid, kind, stream);
    // Nur wirklich beendete Tracks aufräumen. "muted" heißt bei Bildschirmen oft nur: gerade kein neues Bild,
    // weil sich nichts bewegt – früher verschwand der Stream dann dauerhaft.
    const cleanup = () => {
      if (stream.getTracks().every((t) => t.readyState === 'ended') || !stream.getTracks().length) {
        if (this.remote[uid]?.[kind] === stream) delete this.remote[uid][kind];
        update();
      }
    };
    stream.onremovetrack = cleanup;
    e.track.onended = cleanup;
    e.track.onunmute = () => {
      const rr = (this.remote[uid] = this.remote[uid] || {});
      if (!rr[kind]) rr[kind] = stream;
      update();
    };
    update();
  }

  attachAudio(uid, kind, stream) {
    const key = uid + ':' + kind;
    if (!this.ctx) {
      // iPhone (nativ): Ton von angesehenen Streams einfach über ein Audio-Element
      if (!NC) return;
      this.dropAudio(key);
      const el = new Audio();
      el.srcObject = stream;
      el.volume = Math.min(1, this.volumeFor(uid, kind));
      el.play().catch(() => {});
      this.audioNodes[key] = { el };
      return;
    }
    this.dropAudio(key);
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const g = this.ctx.createGain();
    g.gain.value = this.volumeFor(uid, kind);
    const an = this.ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(g);
    g.connect(this.master);
    src.connect(an);
    this.audioNodes[key] = { el, src, g, an };
  }

  dropAudio(key) {
    const n = this.audioNodes[key];
    if (!n) return;
    try {
      n.src?.disconnect();
      n.g?.disconnect();
      n.el.pause?.();
      n.el.srcObject = null;
    } catch {}
    delete this.audioNodes[key];
  }

  removeSenders(peer, kind) {
    for (const s of peer[kind]) {
      try {
        peer.pc.removeTrack(s);
      } catch {}
    }
    peer[kind] = [];
  }

  // ---------- Mute / Deafen ----------
  async toggleMute() {
    if (this.deafened) {
      this.deafened = false;
      this.muted = false;
      if (this.master) this.master.gain.value = prefs.outputVolume;
      sfx('undeafen');
    } else {
      this.muted = !this.muted;
      sfx(this.muted ? 'mute' : 'unmute');
    }
    this.pushState();
  }

  async toggleDeafen() {
    this.deafened = !this.deafened;
    if (this.deafened) this.muted = true;
    else this.muted = false;
    if (this.master) this.master.gain.value = this.deafened ? 0 : prefs.outputVolume;
    sfx(this.deafened ? 'deafen' : 'undeafen');
    this.pushState();
  }

  pushState() {
    if (NC && this.channelId) {
      NC.setMuted({ muted: this.muted || this.isForcedMuted() }).catch(() => {});
      NC.setDeafened({ deafened: this.deafened }).catch(() => {});
    }
    if (this.channelId) rpc('voiceUpdate', { muted: this.muted, deafened: this.deafened }).catch(() => {});
    update();
  }

  // ---------- Kamera ----------
  async toggleCamera() {
    if (!this.channelId) return;
    if (this.camStream) {
      this.camStream.getTracks().forEach((t) => t.stop());
      this.camStream = null;
      for (const p of this.peers.values()) this.removeSenders(p, 'cam');
      await rpc('voiceUpdate', { video: false, cameraStreamId: null }).catch(() => {});
      update();
      return;
    }
    const q = IS_PHONE ? CAMERA_QUALITY['720p'] : CAMERA_QUALITY[prefs.cameraQuality] || CAMERA_QUALITY['720p'];
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: this.camConstraints(q) });
      this.camStream = s;
      this.camQ = q;
      await rpc('voiceUpdate', { video: true, cameraStreamId: s.id });
      for (const p of this.peers.values()) this.addCamTo(p);
    } catch (e) {
      toast('Kamera konnte nicht gestartet werden: ' + e.message, 'error');
    }
    update();
  }

  camConstraints(q) {
    // Handy: Front-/Rückkamera statt Gerätewahl; keine feste Breite/Höhe, damit iOS das volle Bild im
    // Hoch- wie im Querformat liefert (sonst wird das Hochkant-Bild auf einen schmalen Ausschnitt gezoomt)
    if (IS_PHONE) return { facingMode: this.facing || 'user', frameRate: { ideal: 30 } };
    return { deviceId: prefs.cameraDevice ? { exact: prefs.cameraDevice } : undefined, width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } };
  }

  // Neue Kamera-Spur in alle laufenden Verbindungen tauschen (ohne Neuverhandlung)
  async restartCamera() {
    if (!this.camStream) return;
    const old = this.camStream;
    const s = await navigator.mediaDevices.getUserMedia({ video: this.camConstraints(this.camQ || CAMERA_QUALITY['720p']) }).catch(() => null);
    if (!s) return;
    const track = s.getVideoTracks()[0];
    for (const p of this.peers.values()) for (const sender of p.cam || []) await sender.replaceTrack(track).catch(() => {});
    old.getTracks().forEach((t) => t.stop());
    this.camStream = s;
    update();
  }

  // Handy: zwischen Front- und Rückkamera wechseln
  async flipCamera() {
    this.facing = (this.facing || 'user') === 'user' ? 'environment' : 'user';
    if (!this.camStream) return;
    // iOS kann nicht zwei Kameras gleichzeitig öffnen -> alte vorher stoppen
    this.camStream.getTracks().forEach((t) => t.stop());
    await this.restartCamera();
  }

  addCamTo(peer) {
    const track = this.camStream.getVideoTracks()[0];
    const t = peer.pc.addTransceiver(track, {
      direction: 'sendonly',
      streams: [this.camStream],
      sendEncodings: [{ maxBitrate: this.camQ?.br || 2_500_000, maxFramerate: this.camQ?.fps || 30 }],
    });
    peer.cam = [t.sender];
  }

  // ---------- Bildschirm teilen ----------
  async startScreen({ sourceId, quality = '1080p60', audio = true, content = 'motion' }) {
    if (!this.channelId) return;
    if (this.screenStream) await this.stopScreen(true);
    const q = QUALITY[quality] || QUALITY['1080p60'];
    try {
      if (window.nook && sourceId) await window.nook.selectSource(sourceId, audio);
      const video = { frameRate: { ideal: q.fps, max: q.fps } };
      if (q.w) Object.assign(video, { width: { ideal: q.w, max: q.w }, height: { ideal: q.h, max: q.h } });
      const s = await navigator.mediaDevices.getDisplayMedia({ video, audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false, systemAudio: 'include', selfBrowserSurface: 'exclude' });
      const vt = s.getVideoTracks()[0];
      vt.contentHint = content === 'detail' ? 'detail' : 'motion';
      try {
        await vt.applyConstraints(video);
      } catch {}
      vt.onended = () => this.stopScreen();
      this.screenStream = s;
      this.screenQ = q;
      this.screenContent = content;
      const settings = vt.getSettings();
      this.screenInfo = { quality, label: q.label, width: settings.width, height: settings.height, fps: q.fps, audio: s.getAudioTracks().length > 0 };
      await rpc('voiceUpdate', { screenStreamId: s.id, screenInfo: this.screenInfo });
      for (const uid of this.viewers) {
        const p = this.peers.get(uid);
        if (p) this.addScreenTo(p);
      }
      sfx('streamStart');
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast('Bildschirm konnte nicht geteilt werden: ' + e.message, 'error');
    }
    update();
  }

  addScreenTo(peer) {
    if (!this.screenStream || peer.screen.length) return;
    const q = this.screenQ;
    const vt = this.screenStream.getVideoTracks()[0];
    const t = peer.pc.addTransceiver(vt, {
      direction: 'sendonly',
      streams: [this.screenStream],
      sendEncodings: [{ maxBitrate: this.screenBitrate(), maxFramerate: q.fps, priority: 'high', networkPriority: 'high' }],
    });
    preferCodecs(t, 'video', this.screenContent);
    peer.screen = [t.sender];
    const at = this.screenStream.getAudioTracks()[0];
    if (at) {
      const ta = peer.pc.addTransceiver(at, { direction: 'sendonly', streams: [this.screenStream], sendEncodings: [{ maxBitrate: 256000, priority: 'high' }] });
      peer.screen.push(ta.sender);
    }
    // neuer Zuschauer -> Bitrate auf alle Zuschauer neu aufteilen
    this.tuneScreenSenders();
  }

  // Die Upload-Leitung teilen sich alle Zuschauer (jeder bekommt einen eigenen Stream). Bei mehreren
  // Zuschauern wird die Obergrenze pro Person gesenkt, damit niemand ins Stocken gerät.
  screenBitrate() {
    const q = this.screenQ;
    const n = Math.max(1, this.viewers.size);
    return Math.max(2_500_000, Math.round(q.br / Math.sqrt(n)));
  }

  // Parameter erst setzen, wenn die Verbindung ausgehandelt ist (vorher gibt es keine Encodings) -> notfalls erneut versuchen
  tuneScreenSenders(attempt = 0) {
    if (!this.screenStream) return;
    clearTimeout(this.tuneTimer);
    let pending = false;
    for (const peer of this.peers.values()) {
      const s = peer.screen[0];
      if (!s) continue;
      try {
        const p = s.getParameters();
        if (!p.encodings?.length) {
          pending = true;
          continue;
        }
        p.degradationPreference = this.screenContent === 'detail' ? 'maintain-resolution' : 'maintain-framerate';
        p.encodings[0].maxBitrate = this.screenBitrate();
        p.encodings[0].maxFramerate = this.screenQ.fps;
        p.encodings[0].priority = 'high';
        p.encodings[0].networkPriority = 'high';
        s.setParameters(p).catch(() => {});
      } catch {
        pending = true;
      }
    }
    if (pending && attempt < 20) this.tuneTimer = setTimeout(() => this.tuneScreenSenders(attempt + 1), 500);
  }

  async stopScreen(silent) {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    for (const p of this.peers.values()) this.removeSenders(p, 'screen');
    if (this.focus?.uid === S.me.id && this.focus.kind === 'screen') this.focus = null;
    await rpc('voiceUpdate', { screenStreamId: null, screenInfo: null }).catch(() => {});
    if (!silent) sfx('streamStop');
    update();
  }

  watch(uid) {
    this.watching.add(uid);
    this.signal(uid, { watch: true });
    this.focus = { uid, kind: 'screen' };
    update();
  }

  unwatch(uid) {
    this.watching.delete(uid);
    this.signal(uid, { watch: false });
    if (this.remote[uid]) delete this.remote[uid].screen;
    this.dropAudio(uid + ':screen');
    if (this.focus?.uid === uid && this.focus.kind === 'screen') this.focus = null;
    delete this.screenStats[uid];
    update();
  }

  // ---------- Soundboard ----------
  async playSound(sound) {
    // iPhone (nativ): Der Sound lässt sich nicht ins Mikro mischen. Deshalb spielen ihn die anderen selbst ab
    // (siehe onSoundboard) und das iPhone über die native Erweiterung, ohne den Anruf-Ton zu stören.
    if (NC && this.channelId) {
      rpc('soundboard', { soundId: `${sound.id}::${sound.url}::${sound.volume ?? 1}`, emoji: sound.emoji || '🔊' }).catch(() => toast('Sound konnte nicht gesendet werden', 'error'));
      this.playNativeSound(sound.url, Math.min(1, (sound.volume ?? 1) * prefs.outputVolume));
      return;
    }
    if (!this.ctx) return toast('Tritt erst einem Sprachkanal bei', 'error');
    try {
      let buf = this.soundCache.get(sound.url);
      if (!buf) {
        const ab = await fetch(fileUrl(sound.url)).then((r) => r.arrayBuffer());
        buf = await this.ctx.decodeAudioData(ab);
        this.soundCache.set(sound.url, buf);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = sound.volume ?? 1;
      src.connect(g).connect(this.sfxGain);
      src.start();
      rpc('soundboard', { soundId: sound.id, emoji: sound.emoji || '🔊' }).catch(() => {});
    } catch (e) {
      toast('Sound konnte nicht abgespielt werden', 'error');
    }
  }

  // iPhone: Der native Player kann kein .ogg/.webm. Deshalb hier (ohne Lautsprecher, nur rechnen) in ein
  // kleines WAV umwandeln und als data:-Adresse übergeben.
  async playNativeSound(url, volume) {
    let step = 'Laden';
    try {
      this.wavCache = this.wavCache || new Map();
      let wav = this.wavCache.get(url);
      if (!wav) {
        const res = await fetch(fileUrl(url));
        if (!res.ok) throw new Error('Server antwortet ' + res.status);
        const ab = await res.arrayBuffer();
        let pcm;
        step = 'Entschlüsseln';
        try {
          const buf = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(ab.slice(0));
          pcm = { channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), rate: buf.sampleRate, length: buf.length };
        } catch {
          // iOS kann Ogg-Opus nicht selbst öffnen -> eigener Decoder (wird nur hier nachgeladen)
          step = 'Ogg-Decoder';
          pcm = await decodeOggOpus(new Uint8Array(ab));
        }
        step = 'Umwandeln';
        wav = toWavDataUrl(pcm, 30);
        if (this.wavCache.size > 40) this.wavCache.clear();
        this.wavCache.set(url, wav);
      }
      step = 'Abspielen';
      // data: reine Base64-Daten (neuere App), url als Rückfall für ältere App-Versionen
      await NC.playSound({ url: wav, data: wav.slice(wav.indexOf(',') + 1), volume });
    } catch (e) {
      console.warn('Klangbox iPhone', step, e);
      toast(`Sound ging nicht (${step}): ${e?.message || e}`, 'error', 7000);
    }
  }

  // Sound von einem iPhone (nativ) lokal abspielen – nur hören, nicht weiterschicken
  async playRemoteSound(d) {
    const [id, url, vol] = String(d.soundId || '').split('::');
    const sound = url ? { id, url, volume: Number(vol) || 1 } : allSounds().find((x) => x.id === id);
    if (!sound || prefs.localMutes[d.userId] || this.deafened) return;
    const volume = Math.min(1, (sound.volume ?? 1) * this.volumeFor(d.userId, 'mic'));
    if (NC) return this.playNativeSound(sound.url, volume);
    if (!this.ctx) return;
    try {
      let buf = this.soundCache.get(sound.url);
      if (!buf) {
        const ab = await fetch(fileUrl(sound.url)).then((r) => r.arrayBuffer());
        buf = await this.ctx.decodeAudioData(ab);
        this.soundCache.set(sound.url, buf);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(this.master);
      src.start();
    } catch {}
  }

  onSoundboard(d) {
    if (d.channelId !== this.channelId) return;
    if (d.userId !== S.me.id && S.voice[d.userId]?.keepAlive) this.playRemoteSound(d);
    const fx = { userId: d.userId, emoji: d.emoji, at: Date.now() };
    this.soundFx.push(fx);
    setTimeout(() => {
      this.soundFx = this.soundFx.filter((x) => x !== fx);
      update();
    }, 2200);
  }

  // ---------- Server-Ereignisse ----------
  onVoiceState(uid, prev, state) {
    if (uid === S.me.id) {
      if (!state && this.channelId && prev?.channelId === this.channelId) {
        // vom Server entfernt
      }
      if (state?.serverMuted && !prev?.serverMuted) toast('Du wurdest von einem Moderator stummgeschaltet');
      if (NC && this.channelId && (!!state?.serverMuted !== !!prev?.serverMuted || !!state?.suppressed !== !!prev?.suppressed)) {
        NC.setMuted({ muted: this.muted || !!state?.serverMuted || !!state?.suppressed }).catch(() => {});
      }
      return;
    }
    if (!this.channelId) return;
    const wasHere = prev?.channelId === this.channelId;
    const isHere = state?.channelId === this.channelId;
    if (isHere && !wasHere) sfx('join');
    if (wasHere && !isHere) {
      sfx('leave');
      this.closePeer(uid);
    }
    if (isHere && prev?.screenStreamId && !state.screenStreamId) {
      this.watching.delete(uid);
      if (this.remote[uid]) delete this.remote[uid].screen;
      this.dropAudio(uid + ':screen');
      if (this.focus?.uid === uid && this.focus.kind === 'screen') this.focus = null;
    }
    if (isHere && prev?.cameraStreamId && !state.cameraStreamId && this.remote[uid]) delete this.remote[uid].camera;
  }
}

// Ogg-Opus selbst entschlüsseln (renderer/opus.js vom Nook-Server); auf 24 kHz halbiert, reicht für Sounds
let opusLoad = null;
async function decodeOggOpus(bytes) {
  if (!window.NookOpus) {
    opusLoad =
      opusLoad ||
      new Promise((ok, fail) => {
        const sc = document.createElement('script');
        sc.src = (S.serverUrl || '') + '/opus.js';
        sc.onload = ok;
        sc.onerror = () => {
          opusLoad = null;
          fail(new Error('Decoder nicht ladbar'));
        };
        document.head.appendChild(sc);
      });
    await opusLoad;
  }
  const dec = new window.NookOpus();
  await dec.ready;
  try {
    const r = await dec.decodeFile(bytes);
    if (!r.samplesDecoded) throw new Error('Sound leer');
    const half = Math.floor(r.samplesDecoded / 2);
    const channels = r.channelData.map((ch) => {
      const out = new Float32Array(half);
      for (let i = 0; i < half; i++) out[i] = (ch[2 * i] + ch[2 * i + 1]) / 2;
      return out;
    });
    return { channels, rate: r.sampleRate / 2, length: half };
  } finally {
    dec.free();
  }
}

// PCM { channels, rate, length } -> Mono-WAV (16 Bit) als data:-Adresse, höchstens maxSec Sekunden
function toWavDataUrl(pcm, maxSec) {
  const rate = pcm.rate;
  const len = Math.min(pcm.length, Math.round(rate * maxSec));
  const chans = pcm.channels;
  const out = new DataView(new ArrayBuffer(44 + len * 2));
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  out.setUint32(4, 36 + len * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (const ch of chans) v += ch[i];
    v = Math.max(-1, Math.min(1, v / chans.length));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && prefs.pttKey.startsWith('Key');
}

export const V = new VoiceEngine();
// Für sounds.js: Während nativer iPhone-Anrufe keine Web-Töne abspielen (siehe setupAudio)
window.__nookNativeCall = () => NATIVE_CALL && !!V.channelId;
bindVoice(V);
window.addEventListener('beforeunload', () => V.channelId && rpc('voiceLeave', {}).catch(() => {}));
