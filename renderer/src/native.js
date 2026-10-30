// Native Erweiterung der iPhone-App (native/nook-call). Am PC und im Browser gibt es sie nicht -> NC ist null.
// Die Oberfläche enthält kein @capacitor/core (Capacitor.registerPlugin/isPluginAvailable gibt es dann nicht).
// Deshalb direkt über die Brücke, die die App selbst einbaut: PluginHeaders sagt, welche Aufrufe es gibt,
// nativePromise/addListener reden mit der Erweiterung.
export const NC = (() => {
  try {
    const C = window.Capacitor;
    const header = C?.PluginHeaders?.find?.((h) => h.name === 'NookCall');
    if (!header || typeof C.nativePromise !== 'function') return null;
    const known = new Set((header.methods || []).map((m) => m.name));
    return new Proxy(
      {},
      {
        get(_, name) {
          if (typeof name !== 'string' || name === 'then') return undefined;
          if (name === 'addListener') return (event, cb) => Promise.resolve(C.addListener('NookCall', event, (data) => data != null && cb(data)));
          // Aufrufe, die eine ältere App-Version noch nicht kennt, schlagen sauber fehl
          if (!known.has(name)) return () => Promise.reject(new Error(`„${name}“ gibt es in dieser App-Version noch nicht`));
          return (opts = {}) => C.nativePromise('NookCall', name, opts);
        },
      },
    );
  } catch {
    return null;
  }
})();

// ---------- Angemeldet bleiben (iPhone-Schlüsselbund) ----------
// Ältere App-Versionen kennen diese Aufrufe noch nicht – Fehler werden dann einfach ignoriert.
export function saveNativeLogin(server, token) {
  NC?.saveLogin({ server, token }).catch(() => {});
}

export function clearNativeLogin() {
  NC?.clearLogin().catch(() => {});
}

export async function loadNativeLogin() {
  if (!NC) return null;
  try {
    const r = await NC.loadLogin();
    return r?.token && r?.server ? r : null;
  } catch {
    return null;
  }
}
