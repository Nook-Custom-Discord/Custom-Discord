// Stellt die Dateien für die iPhone-App zusammen (Ordner mobile-www).
// Die App holt sich danach die aktuelle Oberfläche vom Nook-Server (Live-Updates wie am PC);
// die hier eingebaute Version wird nur benutzt, solange noch kein Server eingetragen ist.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'mobile-www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'styles.css', 'bundle.js', 'manifest.webmanifest', 'icons', 'opus.js']) {
  const src = path.join(root, 'renderer', f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, f), { recursive: true });
}
console.log('mobile-www bereit');
