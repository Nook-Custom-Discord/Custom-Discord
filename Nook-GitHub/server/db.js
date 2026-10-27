// Einfache JSON-Datenbank: alles im Speicher, wird verzögert auf die Platte geschrieben.
// Für eine Freundesgruppe völlig ausreichend und braucht keine nativen Module.
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({
  users: {},
  tokens: {},
  rel: {},
  servers: {},
  channels: {},
  messages: {},
  invites: {},
  reads: {},
});

class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.data = EMPTY();
    if (fs.existsSync(file)) {
      try {
        this.data = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch (e) {
        const backup = file + '.broken-' + Date.now();
        fs.copyFileSync(file, backup);
        console.error('[db] Datenbank beschädigt, Backup unter', backup);
      }
    }
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 800);
  }

  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

let seq = 0;
function newId() {
  seq = (seq + 1) % 1296;
  return (
    Date.now().toString(36).padStart(9, '0') +
    seq.toString(36).padStart(2, '0') +
    Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')
  );
}

module.exports = { Store, newId };
