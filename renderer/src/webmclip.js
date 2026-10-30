// Schneidet aus einer laufenden WebM-Aufnahme (MediaRecorder) die letzten Sekunden heraus.
// Der Recorder liefert einmal den Kopf (EBML + Segment-Infos + Spuren) und danach endlos Cluster.
// Für einen Clip nehmen wir den Kopf, suchen den Cluster, der mit einem Video-Keyframe beginnt,
// setzen alle Zeitstempel auf 0 zurück und tragen die Dauer ein – das ergibt eine normale .webm-Datei.

const ID = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  SEEKHEAD: 0x114d9b74,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CUES: 0x1c53bb6b,
  CLUSTER: 0x1f43b675,
  TIMECODE: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  REFERENCE_BLOCK: 0xfb,
};
// Kinder eines Clusters, die vorkommen dürfen (alles andere beendet den Cluster)
const CLUSTER_CHILDREN = new Set([ID.TIMECODE, ID.SIMPLE_BLOCK, ID.BLOCK_GROUP, 0xa7, 0xab, 0x5854]);

// Element-ID (mit Markierungsbit) ab p
function readId(b, p) {
  const f = b[p];
  if (f === undefined || f === 0) return null;
  const len = f >= 0x80 ? 1 : f >= 0x40 ? 2 : f >= 0x20 ? 3 : f >= 0x10 ? 4 : 0;
  if (!len || p + len > b.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + b[p + i];
  return { id, len };
}
// Größenangabe (ohne Markierungsbit) ab p; unknown = „Größe offen“ (Live-Aufnahme)
function readSize(b, p) {
  const f = b[p];
  if (f === undefined || f === 0) return null;
  let len = 1;
  let mask = 0x80;
  while (!(f & mask)) {
    mask >>= 1;
    len++;
  }
  if (p + len > b.length) return null;
  let value = f & (mask - 1);
  let unknown = value === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[p + i];
    if (b[p + i] !== 0xff) unknown = false;
  }
  return { value, len, unknown };
}
function readUint(b, p, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[p + i];
  return v;
}
function encId(id) {
  const out = [];
  while (id > 0) {
    out.unshift(id & 0xff);
    id = Math.floor(id / 256);
  }
  return out;
}
function encSize(n) {
  let len = 1;
  while (n >= 2 ** (7 * len) - 1) len++;
  const out = new Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = n % 256;
    n = Math.floor(n / 256);
  }
  out[0] |= 0x80 >> (len - 1);
  return out;
}
function element(id, payload) {
  return concat([Uint8Array.from(encId(id)), Uint8Array.from(encSize(payload.length)), payload]);
}
export function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// Kinder eines Elements mit bekannter Größe auflisten
function children(b, start, end) {
  const out = [];
  let p = start;
  while (p < end) {
    const id = readId(b, p);
    if (!id) break;
    const sz = readSize(b, p + id.len);
    if (!sz) break;
    const data = p + id.len + sz.len;
    const stop = sz.unknown ? end : data + sz.value;
    out.push({ id: id.id, start: p, data, end: Math.min(stop, end) });
    p = stop;
  }
  return out;
}

// Position des ersten Clusters im Kopf (Ende des Kopfs), sonst -1
export function findHeaderEnd(b) {
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] === 0x1f && b[i + 1] === 0x43 && b[i + 2] === 0xb6 && b[i + 3] === 0x75 && parseCluster(b, i, true)) return i;
  }
  return -1;
}

// Kopf zerlegen: EBML-Kopf, Segment-Kinder, Videospur, Zeitbasis
export function parseHeader(b) {
  const top = readId(b, 0);
  if (!top || top.id !== ID.EBML) throw new Error('Kein WebM-Kopf');
  const ebmlSize = readSize(b, top.len);
  const ebmlEnd = top.len + ebmlSize.len + ebmlSize.value;
  const seg = readId(b, ebmlEnd);
  if (!seg || seg.id !== ID.SEGMENT) throw new Error('Kein Segment');
  const segSize = readSize(b, ebmlEnd + seg.len);
  const segData = ebmlEnd + seg.len + segSize.len;
  const kids = children(b, segData, b.length);
  let scale = 1_000_000;
  let videoTrack = 0;
  for (const k of kids) {
    if (k.id === ID.INFO) for (const c of children(b, k.data, k.end)) if (c.id === ID.TIMECODE_SCALE) scale = readUint(b, c.data, c.end - c.data);
    if (k.id === ID.TRACKS)
      for (const t of children(b, k.data, k.end)) {
        if (t.id !== ID.TRACK_ENTRY) continue;
        let num = 0;
        let type = 0;
        for (const c of children(b, t.data, t.end)) {
          if (c.id === ID.TRACK_NUMBER) num = readUint(b, c.data, c.end - c.data);
          if (c.id === ID.TRACK_TYPE) type = readUint(b, c.data, c.end - c.data);
        }
        if (type === 1 && !videoTrack) videoTrack = num;
      }
  }
  return { b, ebmlEnd, kids, scale, videoTrack };
}

// Kopf neu bauen: ohne Sprungtabelle/Index, Segmentgröße offen, Dauer eingetragen
function buildHeader(h, durationTicks) {
  const { b } = h;
  const parts = [b.subarray(0, h.ebmlEnd), Uint8Array.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])];
  for (const k of h.kids) {
    if (k.id === ID.SEEKHEAD || k.id === ID.CUES) continue;
    if (k.id === ID.INFO) {
      const keep = children(b, k.data, k.end)
        .filter((c) => c.id !== ID.DURATION)
        .map((c) => b.subarray(c.start, c.end));
      const dur = new Uint8Array(8);
      new DataView(dur.buffer).setFloat64(0, durationTicks);
      parts.push(element(ID.INFO, concat([...keep, element(ID.DURATION, dur)])));
    } else parts.push(b.subarray(k.start, k.end));
  }
  return concat(parts);
}

// Einen Cluster ab p lesen: Zeitstempel, Ende, erster Video-Block ein Keyframe?
// check=true: nur prüfen, ob hier wirklich ein Cluster beginnt
function parseCluster(b, p, check = false, videoTrack = 0) {
  const sz = readSize(b, p + 4);
  if (!sz) return null;
  const data = p + 4 + sz.len;
  const hardEnd = sz.unknown ? b.length : Math.min(b.length, data + sz.value);
  // erstes Kind muss der Zeitstempel sein
  const first = readId(b, data);
  if (!first || first.id !== ID.TIMECODE) return null;
  const tsz = readSize(b, data + 1);
  if (!tsz || tsz.len !== 1 || tsz.value < 1 || tsz.value > 8 || data + 1 + tsz.len + tsz.value > b.length) return null;
  const tcPos = data + 2;
  const tcLen = tsz.value;
  const tc = readUint(b, tcPos, tcLen);
  if (check) return { tc };
  let q = tcPos + tcLen;
  let key = null; // erster Video-Block: Keyframe ja/nein
  let last = 0; // spätester Block-Zeitpunkt relativ zum Cluster
  let end = q;
  while (q < hardEnd) {
    const id = readId(b, q);
    if (!id || !CLUSTER_CHILDREN.has(id.id)) break;
    const s = readSize(b, q + id.len);
    if (!s || s.unknown) break;
    const d = q + id.len + s.len;
    const e = d + s.value;
    if (e > b.length) break; // unvollständig (Aufnahme läuft noch)
    let blk = -1;
    let isKey = false;
    if (id.id === ID.SIMPLE_BLOCK) {
      blk = d;
      isKey = !!(b[d + readSize(b, d).len + 2] & 0x80);
    } else if (id.id === ID.BLOCK_GROUP) {
      isKey = true;
      for (const c of children(b, d, e)) {
        if (c.id === ID.BLOCK) blk = c.data;
        if (c.id === ID.REFERENCE_BLOCK) isKey = false;
      }
    }
    if (blk >= 0) {
      const tn = readSize(b, blk);
      const rel = new DataView(b.buffer, b.byteOffset + blk + tn.len, 2).getInt16(0);
      if (rel > last) last = rel;
      if (key === null && tn.value === videoTrack) key = isKey;
    }
    q = e;
    end = e;
  }
  return { start: p, end, tc, tcPos, tcLen, key: !!key, last: tc + last, open: sz.unknown };
}

function isClusterAt(b, i) {
  return b[i] === 0x1f && b[i + 1] === 0x43 && b[i + 2] === 0xb6 && b[i + 3] === 0x75;
}

// Alle vollständigen Cluster in den Daten finden (die Daten dürfen mitten in einem Cluster anfangen)
export function scanClusters(b, videoTrack) {
  const out = [];
  let i = 0;
  while (i + 4 <= b.length) {
    if (!isClusterAt(b, i)) {
      i++;
      continue;
    }
    const c = parseCluster(b, i, false, videoTrack);
    if (!c) {
      i++;
      continue;
    }
    out.push(c);
    i = c.end > i ? c.end : i + 1;
  }
  return out;
}

// header: Bytes vor dem ersten Cluster, data: Cluster-Bytes (Anfang darf abgeschnitten sein)
// Ergebnis: fertige .webm-Datei mit höchstens lengthMs Länge (bis zum letzten vollständigen Block)
export function makeClip(header, data, lengthMs) {
  const h = parseHeader(header);
  const msPerTick = h.scale / 1e6;
  const clusters = scanClusters(data, h.videoTrack).filter((c) => c.end > c.tcPos + c.tcLen);
  if (!clusters.length) throw new Error('Noch keine Aufnahme im Puffer');
  const endTick = Math.max(...clusters.map((c) => c.last));
  const want = endTick - lengthMs / msPerTick;
  const keys = clusters.filter((c) => c.key || !h.videoTrack);
  if (!keys.length) throw new Error('Kein Startbild im Puffer');
  // spätester Keyframe-Cluster vor dem Wunschstart, sonst der früheste vorhandene
  let startC = keys[0];
  for (const c of keys) if (c.tc <= want) startC = c;
  const base = startC.tc;
  const parts = [];
  for (const c of clusters) {
    if (c.start < startC.start) continue;
    const bytes = data.slice(c.start, c.end);
    // Zeitstempel relativ zum Clip-Anfang (passt immer in dieselbe Bytebreite, weil kleiner)
    let v = c.tc - base;
    for (let k = c.tcLen - 1; k >= 0; k--) {
      bytes[c.tcPos - c.start + k] = v % 256;
      v = Math.floor(v / 256);
    }
    parts.push(bytes);
  }
  const durationTicks = endTick - base + 1;
  return { bytes: concat([buildHeader(h, durationTicks), ...parts]), durationMs: durationTicks * msPerTick };
}
