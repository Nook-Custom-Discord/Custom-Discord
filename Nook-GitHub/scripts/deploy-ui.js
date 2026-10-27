// Verteilt die aktuelle Oberfläche live an alle: kopiert bundle.js + styles.css
// in den ui-Ordner des laufenden Nook-Servers. Alle verbundenen Apps laden sich die neue Version automatisch.
// Ziel: NOOK_UI_DIR, sonst der Datenordner der Host-App auf diesem PC.
const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA, 'Nook', 'server-data', 'ui');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Nook', 'server-data', 'ui');
  return path.join(os.homedir(), '.config', 'Nook', 'server-data', 'ui');
}
// Fernverteilung an einen anderen Server (z. B. Raspberry Pi):
//   NOOK_DEPLOY_URL=https://mein-pi.ts.net NOOK_DEPLOY_KEY=<admin.key> npm run deploy
if (process.env.NOOK_DEPLOY_URL) {
  (async () => {
    for (const f of ['styles.css', 'bundle.js']) {
      const body = fs.readFileSync(path.join(__dirname, '..', 'renderer', f));
      const r = await fetch(`${process.env.NOOK_DEPLOY_URL.replace(/\/$/, '')}/api/admin/${process.env.NOOK_DEPLOY_KEY}/ui/${f}`, { method: 'PUT', body });
      if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
    }
    console.log('Neue Oberfläche verteilt an', process.env.NOOK_DEPLOY_URL);
  })().catch((e) => {
    console.error('Verteilen fehlgeschlagen:', e.message);
    process.exit(1);
  });
  return;
}
const dir = process.env.NOOK_UI_DIR || defaultDir();
fs.mkdirSync(dir, { recursive: true });
for (const f of ['styles.css', 'bundle.js']) {
  // erst in temporäre Datei, dann umbenennen -> nie halb geschriebene Dateien
  const tmp = path.join(dir, f + '.tmp');
  fs.copyFileSync(path.join(__dirname, '..', 'renderer', f), tmp);
  fs.renameSync(tmp, path.join(dir, f));
}
console.log('Neue Oberfläche verteilt nach', dir);
