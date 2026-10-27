// Bereitet den Umzug auf einen Raspberry Pi vor.
// Legt Code-Paket + fertig befülltes install.sh in einen zufälligen Ordner des laufenden Nook-Servers auf diesem PC.
// Ausgabe: der eine Befehl, der auf dem Pi ausgeführt werden muss.
//   node scripts/pi-pack.js [http://<PC-IP>:3500]
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dataDir = process.env.NOOK_DATA || (process.platform === 'win32' ? path.join(process.env.APPDATA, 'Nook', 'server-data') : path.join(os.homedir(), '.config', 'Nook', 'server-data'));
const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('100.'))?.address;
const origin = process.argv[2] || `http://${lanIp}:3500`;
const key = fs.readFileSync(path.join(dataDir, 'admin.key'), 'utf8').trim();

const folder = 'pi-' + crypto.randomBytes(8).toString('hex');
const outDir = path.join(dataDir, 'ui', folder);
fs.mkdirSync(outDir, { recursive: true });

// Staging: nur was der Server braucht
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nookpi-'));
const copy = (rel) => fs.cpSync(path.join(root, rel), path.join(stage, rel), { recursive: true });
['server', 'shared', 'scripts/deploy-ui.js', 'renderer/index.html', 'renderer/styles.css', 'renderer/bundle.js', 'renderer/manifest.webmanifest', 'renderer/sw.js', 'renderer/icons'].forEach(copy);
const pkg = require(path.join(root, 'package.json'));
fs.writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify({ name: 'nook-server', version: pkg.version, private: true, main: 'server/cli.js', scripts: { start: 'node server/cli.js' }, dependencies: pkg.dependencies }, null, 2)
);
execFileSync(process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar', ['-czf', path.join(outDir, 'nook-server.tgz'), '-C', stage, '.']);
fs.rmSync(stage, { recursive: true, force: true });

const script = fs
  .readFileSync(path.join(__dirname, 'pi', 'install.sh'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace('__SRC__', `${origin}/${folder}`)
  .replace('__ORIGIN__', origin)
  .replace('__KEY__', key);
fs.writeFileSync(path.join(outDir, 'install.sh'), script);

console.log('Paket bereit in', outDir);
console.log('\nBefehl für den Raspberry Pi:\n');
console.log(`curl -fsSL ${origin}/${folder}/install.sh | bash\n`);
