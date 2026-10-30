// Native Erweiterung der iPhone-App (native/nook-call). Am PC und im Browser gibt es sie nicht -> NC ist null.
export const NC = (() => {
  try {
    const C = window.Capacitor;
    return C?.isPluginAvailable?.('NookCall') ? C.registerPlugin('NookCall') : null;
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
