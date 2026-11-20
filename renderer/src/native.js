// Native Erweiterungen der Handy-Apps. Am PC und im Browser gibt es sie nicht -> NC/NA sind null.
//  - NC = NookCall (iPhone, native/nook-call): Anrufe laufen nativ, Login im Schlüsselbund
//  - NA = NookAndroid (Android, native/android): hält Anrufe im Hintergrund am Leben (Vordergrund-Dienst)
// Die Oberfläche enthält kein @capacitor/core (Capacitor.registerPlugin/isPluginAvailable gibt es dann nicht).
// Deshalb direkt über die Brücke, die die App selbst einbaut: PluginHeaders sagt, welche Aufrufe es gibt,
// nativePromise/addListener reden mit der Erweiterung.
function plugin(pluginName) {
  try {
    const C = window.Capacitor;
    const header = C?.PluginHeaders?.find?.((h) => h.name === pluginName);
    if (!header || typeof C.nativePromise !== 'function') return null;
    const known = new Set((header.methods || []).map((m) => m.name));
    return new Proxy(
      {},
      {
        get(_, name) {
          if (typeof name !== 'string' || name === 'then') return undefined;
          if (name === 'addListener') return (event, cb) => Promise.resolve(C.addListener(pluginName, event, (data) => data != null && cb(data)));
          // Aufrufe, die eine ältere App-Version noch nicht kennt, schlagen sauber fehl
          if (!known.has(name)) return () => Promise.reject(new Error(`„${name}“ gibt es in dieser App-Version noch nicht`));
          return (opts = {}) => C.nativePromise(pluginName, name, opts);
        },
      },
    );
  } catch {
    return null;
  }
}

export const NC = plugin('NookCall');
export const NA = plugin('NookAndroid');

// Läuft die Oberfläche in einer Handy-App? iPhone: Seite unter capacitor://, Android: https://localhost,
// erkennbar am Zusatz „NookApp“ im User-Agent (capacitor.config.json → android.appendUserAgent).
export const IS_ANDROID_APP = /NookApp/.test(navigator.userAgent) || (window.Capacitor?.getPlatform?.() === 'android');
export const IS_IOS_APP = location.protocol === 'capacitor:';
export const IS_APP = IS_IOS_APP || IS_ANDROID_APP;

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
