// WebRTC-Mesh: jeder ist mit jedem direkt verbunden (ideal für Freundesgruppen bis ~10 Personen).
// Bildschirm-Streams werden nur an Leute geschickt, die auf "Ansehen" klicken – spart Bandbreite.
import { S, update, prefs, setPref, toast } from './store';
import { rpc, bindVoice, fileUrl, displayName, serverIdOf } from './api';
import { sfx, stopRing } from './sounds';

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

function preferCodecs(transceiver, kind) {
  try {
    const caps = RTCRtpReceiver.getCapabilities(kind)?.codecs;
    if (!caps || !transceiver.setCodecPreferences) return;
    const order = kind === 'video' ? ['video/H264', 'video/VP9', 'video/AV1', 'video/VP8'] : ['audio/opus'];
    const sorted = [...caps].sort((a, b) => {
      const ia = order.indexOf(a.mimeType);
      const ib = order.indexOf(b.mimeType);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    transceiver.setCodecPreferences(sorted);
  } catch {}
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
    this.buf = new Float32Array(512);

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
      const ch = S.channels[channelId];
      this.channelId = channelId;
      this.serverId = serverIdOf(ch);
      const res = await rpc('voiceJoin', { channelId, muted: this.muted, deafened: this.deafened });
      for (const uid of res.peers) this.createPeer(uid);
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
    if (!silent) sfx('leave');
    else sfx('hangup');
    update();
    if (S.uiUpdate && S.uiUpdate !== window.__NOOK_UI_V) import('./api').then((m) => m.reloadForUpdate());
  }

  // ---------- Audio-Graph ----------
  async setupAudio() {
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
    await this.startMic();
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

  async collectStats() {
    let total = 0;
    let n = 0;
    for (const p of this.peers.values()) {
      try {
        const stats = await p.pc.getStats();
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && r.currentRoundTripTime != null) {
            total += r.currentRoundTripTime * 1000;
            n++;
          }
        });
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
    // addTrack (statt addTransceiver), damit der Sender beim Annehmen eines Angebots wiederverwendet wird
    pc.addTrack(this.micTrack, this.sendStream);
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
    const p = this.peers.get(uid);
    if (p) p.pc.close();
    this.peers.delete(uid);
    for (const k of Object.keys(this.audioNodes)) if (k.startsWith(uid + ':')) this.dropAudio(k);
    delete this.remote[uid];
    this.watching.delete(uid);
    this.viewers.delete(uid);
    this.speaking.delete(uid);
    if (this.focus?.uid === uid) this.focus = null;
  }

  signal(to, data) {
    rpc('rtc', { to, data }).catch(() => {});
  }

  async onSignal(from, data) {
    if (!this.channelId) return;
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
    if (e.track.kind === 'audio') this.attachAudio(uid, kind, stream);
    const cleanup = () => {
      if (stream.getTracks().every((t) => t.readyState === 'ended' || t.muted) || !stream.getTracks().length) {
        if (this.remote[uid]?.[kind] === stream) delete this.remote[uid][kind];
        update();
      }
    };
    stream.onremovetrack = cleanup;
    e.track.onended = cleanup;
    e.track.onunmute = () => update();
    update();
  }

  attachAudio(uid, kind, stream) {
    if (!this.ctx) return;
    const key = uid + ':' + kind;
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
      n.src.disconnect();
      n.g.disconnect();
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
    const q = CAMERA_QUALITY[prefs.cameraQuality] || CAMERA_QUALITY['720p'];
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: prefs.cameraDevice ? { exact: prefs.cameraDevice } : undefined, width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } },
      });
      this.camStream = s;
      this.camQ = q;
      await rpc('voiceUpdate', { video: true, cameraStreamId: s.id });
      for (const p of this.peers.values()) this.addCamTo(p);
    } catch (e) {
      toast('Kamera konnte nicht gestartet werden: ' + e.message, 'error');
    }
    update();
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
      sendEncodings: [{ maxBitrate: q.br, maxFramerate: q.fps, priority: 'high', networkPriority: 'high' }],
    });
    preferCodecs(t, 'video');
    peer.screen = [t.sender];
    const at = this.screenStream.getAudioTracks()[0];
    if (at) {
      const ta = peer.pc.addTransceiver(at, { direction: 'sendonly', streams: [this.screenStream], sendEncodings: [{ maxBitrate: 256000 }] });
      peer.screen.push(ta.sender);
    }
    setTimeout(async () => {
      try {
        const p = t.sender.getParameters();
        p.degradationPreference = this.screenContent === 'detail' ? 'maintain-resolution' : 'maintain-framerate';
        if (p.encodings?.[0]) {
          p.encodings[0].maxBitrate = q.br;
          p.encodings[0].maxFramerate = q.fps;
        }
        await t.sender.setParameters(p);
      } catch {}
    }, 1500);
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
    update();
  }

  // ---------- Soundboard ----------
  async playSound(sound) {
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

  onSoundboard(d) {
    if (d.channelId !== this.channelId) return;
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

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && prefs.pttKey.startsWith('Key');
}

export const V = new VoiceEngine();
bindVoice(V);
window.addEventListener('beforeunload', () => V.channelId && rpc('voiceLeave', {}).catch(() => {}));
