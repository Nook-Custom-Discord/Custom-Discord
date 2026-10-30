// Spiel-Erkennung (Oberfläche): die Desktop-App meldet das laufende Spiel, wir zeigen es Freunden
// als „Spielt …“ samt Startzeit. Eine selbst gesetzte Aktivität hat immer Vorrang.
import { S, update, prefs } from './store';
import { rpc, isElectron, readyHooks, activityHooks } from './api';

export const GAME = { current: null }; // { name, exe, since }

let sent = null; // zuletzt an den Server gemeldeter Spielname (oder null)

export function publishGame() {
  if (!S.me || S.conn !== 'ready') return;
  const mine = S.activities[S.me.id];
  if (mine && !mine.auto) return; // eigene Aktivität nicht überschreiben
  const g = prefs.shareGames !== false ? GAME.current : null;
  const key = g ? g.name + '@' + g.since : null;
  if (key === sent) return;
  sent = key;
  rpc('setActivity', { activity: g ? { type: 'Spielt', name: g.name, since: g.since, auto: true } : null }).catch(() => {});
}

export function initGames(onChange) {
  if (!isElectron || !window.nook.games) return;
  window.nook.on('game', (g) => {
    GAME.current = g;
    publishGame();
    onChange?.(g);
    update();
  });
  window.nook.games.watch(true).then((g) => {
    GAME.current = g || null;
    publishGame();
    onChange?.(GAME.current);
    update();
  });
  // nach jeder (Neu-)Verbindung erneut melden – der Server vergisst Aktivitäten beim Trennen
  readyHooks.push(() => {
    sent = undefined;
    publishGame();
  });
  // eigene Aktivität entfernt -> erkanntes Spiel wieder anzeigen
  activityHooks.push((uid, a) => {
    if (uid !== S.me?.id || a || !GAME.current) return;
    sent = undefined;
    publishGame();
  });
}

// „seit 1 Std. 5 Min.“ – kurz für Listen
export function playTime(since, now = Date.now()) {
  if (!since) return '';
  const min = Math.max(0, Math.floor((now - since) / 60000));
  if (min < 1) return 'gerade gestartet';
  if (min < 60) return `seit ${min} Min.`;
  const h = Math.floor(min / 60);
  return `seit ${h} Std.${min % 60 ? ` ${min % 60} Min.` : ''}`;
}
// „1:05:12“ – laufende Uhr für die Profilkarte
export function playClock(since, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60);
}
