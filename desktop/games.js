// Spiel-Erkennung (Hauptprozess): schaut alle paar Sekunden, welche Programme laufen,
// und meldet das Spiel, das gerade gespielt wird – samt Startzeit, damit Freunde die Spielzeit sehen.
const { spawn, execFile } = require('child_process');
const path = require('path');

// bekannte Spiele: Name der .exe (Windows) bzw. des Programms (Mac/Linux), klein geschrieben
const KNOWN = {
  'fortniteclient-win64-shipping': 'Fortnite',
  'valorant-win64-shipping': 'VALORANT',
  'league of legends': 'League of Legends',
  leagueoflegends: 'League of Legends',
  cs2: 'Counter-Strike 2',
  csgo: 'Counter-Strike: Global Offensive',
  r5apex: 'Apex Legends',
  r5apex_dx12: 'Apex Legends',
  rocketleague: 'Rocket League',
  'minecraft.windows': 'Minecraft',
  minecraft: 'Minecraft',
  gta5: 'Grand Theft Auto V',
  gta5_enhanced: 'Grand Theft Auto V',
  playgtav: 'Grand Theft Auto V',
  rdr2: 'Red Dead Redemption 2',
  overwatch: 'Overwatch 2',
  cod: 'Call of Duty',
  'cod24-cod': 'Call of Duty',
  blackops6: 'Call of Duty: Black Ops 6',
  modernwarfare: 'Call of Duty: Modern Warfare',
  eldenring: 'Elden Ring',
  nightreign: 'Elden Ring Nightreign',
  eurotrucks2: 'Euro Truck Simulator 2',
  amtrucks: 'American Truck Simulator',
  robloxplayerbeta: 'Roblox',
  robloxplayer: 'Roblox',
  dota2: 'Dota 2',
  tslgame: 'PUBG: Battlegrounds',
  destiny2: 'Destiny 2',
  rainbowsix: 'Rainbow Six Siege',
  rainbowsix_vulkan: 'Rainbow Six Siege',
  rainbowsix_be: 'Rainbow Six Siege',
  fc24: 'EA SPORTS FC 24',
  fc25: 'EA SPORTS FC 25',
  fc26: 'EA SPORTS FC 26',
  witcher3: 'The Witcher 3',
  cyberpunk2077: 'Cyberpunk 2077',
  helldivers2: 'Helldivers 2',
  'palworld-win64-shipping': 'Palworld',
  'lethal company': 'Lethal Company',
  'among us': 'Among Us',
  terraria: 'Terraria',
  'stardew valley': 'Stardew Valley',
  stardewvalley: 'Stardew Valley',
  phasmophobia: 'Phasmophobia',
  'deadbydaylight-win64-shipping': 'Dead by Daylight',
  'marvel-win64-shipping': 'Marvel Rivals',
  discovery: 'THE FINALS',
  escapefromtarkov: 'Escape from Tarkov',
  rustclient: 'Rust',
  valheim: 'Valheim',
  sotgame: 'Sea of Thieves',
  forzahorizon5: 'Forza Horizon 5',
  forzahorizon4: 'Forza Horizon 4',
  bf2042: 'Battlefield 2042',
  bf6: 'Battlefield 6',
  pathofexile_x64: 'Path of Exile',
  pathofexile_x64steam: 'Path of Exile',
  pathofexile: 'Path of Exile 2',
  wow: 'World of Warcraft',
  'world of warcraft': 'World of Warcraft',
  hearthstone: 'Hearthstone',
  genshinimpact: 'Genshin Impact',
  starrail: 'Honkai: Star Rail',
  zenlesszonezero: 'Zenless Zone Zero',
  'r.e.p.o.': 'R.E.P.O.',
  repo: 'R.E.P.O.',
  peak: 'PEAK',
  'schedule i': 'Schedule I',
  'baldur\'s gate 3': "Baldur's Gate 3",
  bg3: "Baldur's Gate 3",
  bg3_dx11: "Baldur's Gate 3",
  'hollow knight': 'Hollow Knight',
  'hollow knight silksong': 'Hollow Knight: Silksong',
  'sons of the forest': 'Sons of the Forest',
  satisfactory: 'Satisfactory',
  'factorygame-win64-shipping': 'Satisfactory',
  factorio: 'Factorio',
  'deeprockgalactic-win64-shipping': 'Deep Rock Galactic',
  'fsd-win64-shipping': 'Deep Rock Galactic',
  'ready or not': 'Ready or Not',
  'readyornot-win64-shipping': 'Ready or Not',
  'apex legends': 'Apex Legends',
  'osu!': 'osu!',
  geometrydash: 'Geometry Dash',
  'fall guys': 'Fall Guys',
  fallguys_client_game: 'Fall Guys',
  'brawlhalla': 'Brawlhalla',
  'smite2-win64-shipping': 'SMITE 2',
  'warthunder': 'War Thunder',
  aces: 'War Thunder',
  'worldoftanks': 'World of Tanks',
  'naraka': 'NARAKA: BLADEPOINT',
  'deltaforce-win64-shipping': 'Delta Force',
  'monsterhunterwilds': 'Monster Hunter Wilds',
  'nba2k26': 'NBA 2K26',
  'nba2k25': 'NBA 2K25',
};
// Programme in Spiele-Ordnern, die keine Spiele sind
const NOT_GAMES = /^(steam|steamwebhelper|steamservice|unitycrashhandler(32|64)?|crashreportclient|crashpad_handler|easyanticheat.*|eac.*launcher|be(service|launcher)|.*launcher.*|.*setup.*|.*installer.*|vc_redist.*|dxsetup|uninstall.*|wallpaper(32|64|_engine)?|ue4prereqsetup.*|epicgameslauncher|epicwebhelper|cefsharp.*|qtwebengineprocess|steamvr.*|vrmonitor|vrserver)$/i;
const IGNORED_FOLDERS = /^(steamworks shared|steamvr|wallpaper_engine|wallpaper engine|steam controller configs|common redistributables)$/i;
// Ordner, in denen Spiele installiert werden – der Ordnername ist dann der Spielname
const GAME_DIRS = [/[\\/]steamapps[\\/]common[\\/]([^\\/]+)[\\/]/i, /[\\/]Epic Games[\\/]([^\\/]+)[\\/]/i, /[\\/]XboxGames[\\/]([^\\/]+)[\\/]/i, /[\\/]GOG Galaxy[\\/]Games[\\/]([^\\/]+)[\\/]/i, /[\\/]Ubisoft Game Launcher[\\/]games[\\/]([^\\/]+)[\\/]/i, /[\\/]EA Games[\\/]([^\\/]+)[\\/]/i, /[\\/]Riot Games[\\/]([^\\/]+)[\\/]/i];

const exeKey = (name) => String(name || '').replace(/\.(exe|app)$/i, '').toLowerCase();

// laufende Programme mit Fenster: [{ exe, path, title }]
let psProc = null;
let psBuf = '';
let psResolve = null;
let psFails = 0;
let psOneShot = false;
const PS_LIST = "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.ProcessName + '|' + $_.Path + '|' + $_.MainWindowTitle }";
function listWindows() {
  if (process.env.NOOK_FAKE_GAMES) {
    return Promise.resolve(
      process.env.NOOK_FAKE_GAMES.split(';')
        .filter(Boolean)
        .map((s) => {
          const [exe, p = '', title = ''] = s.split('|');
          return { exe, path: p, title };
        })
    );
  }
  if (process.platform === 'win32') {
    const parse = (out) =>
      out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          const [exe, p = '', ...t] = l.split('|');
          return { exe, path: p, title: t.join('|') };
        });
    // Ausweichweg: jedes Mal eine eigene PowerShell (falls die dauerhaft offene nicht antwortet)
    if (psOneShot) {
      return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' + PS_LIST, 'utf16le').toString('base64')], { windowsHide: true, maxBuffer: 4 << 20, timeout: 20000 }, (err, out) => resolve(parse(String(out || ''))));
      });
    }
    // eine PowerShell bleibt offen und liefert auf Zuruf die Fensterliste (spart den Start bei jeder Abfrage)
    if (!psProc) {
      psProc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
      psProc.stdout.setEncoding('utf8');
      psProc.stdout.on('data', (d) => {
        psBuf += d;
        const i = psBuf.indexOf('@@END@@');
        if (i >= 0) {
          const out = psBuf.slice(0, i);
          psBuf = psBuf.slice(i + 7);
          psResolve?.(out);
          psResolve = null;
        }
      });
      psProc.on('exit', () => {
        psProc = null;
        psResolve?.(null);
        psResolve = null;
      });
      psProc.on('error', () => {});
      psProc.stdin.on('error', () => {});
      psProc.stdin.write('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n');
    }
    return new Promise((resolve) => {
      psResolve = resolve;
      psProc.stdin.write(PS_LIST + "; Write-Output '@@END@@'\n");
      setTimeout(() => {
        if (psResolve === resolve) {
          psResolve = null;
          resolve(null);
        }
      }, 10000);
    }).then((out) => {
      if (out !== null) {
        psFails = 0;
        return parse(out);
      }
      // keine Antwort: nach zwei Fehlversuchen auf den Ausweichweg wechseln
      psProc?.kill();
      psProc = null;
      psBuf = '';
      if (++psFails >= 2) psOneShot = true;
      return [];
    });
  }
  // Mac & Linux: Prozessliste mit vollem Pfad
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'comm='], { maxBuffer: 4 << 20 }, (err, out) => {
      if (err) return resolve([]);
      resolve(
        out
          .split('\n')
          .filter(Boolean)
          .map((p) => ({ exe: path.basename(p.trim()), path: p.trim(), title: '' }))
      );
    });
  });
}

// Spiel aus einem Programm ableiten
function gameOf(w, custom, ignored) {
  const key = exeKey(w.exe);
  if (!key || ignored.includes(key)) return null;
  if (custom[key]) return custom[key];
  if (KNOWN[key]) return KNOWN[key];
  // Minecraft Java läuft als javaw – am Fenstertitel erkennbar
  if ((key === 'javaw' || key === 'java') && /^minecraft/i.test(w.title)) return 'Minecraft';
  if (NOT_GAMES.test(key)) return null;
  for (const re of GAME_DIRS) {
    const m = w.path && w.path.match(re);
    if (m && !IGNORED_FOLDERS.test(m[1])) return m[1].replace(/[_]+/g, ' ').trim();
  }
  return null;
}

class GameWatcher {
  constructor(onChange, getConfig) {
    this.onChange = onChange;
    this.getConfig = getConfig;
    this.current = null; // { name, exe, since }
    this.timer = null;
    this.busy = false;
  }
  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 15000);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    psProc?.kill();
    psProc = null;
    if (this.current) {
      this.current = null;
      this.onChange(null);
    }
  }
  async running() {
    const cfg = this.getConfig();
    const list = await listWindows();
    return list.map((w) => ({ ...w, key: exeKey(w.exe), game: gameOf(w, cfg.customGames || {}, cfg.ignoredGames || []) }));
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const list = await this.running();
      // das bisherige Spiel bleibt, solange es läuft (kein Springen zwischen zwei Spielen)
      let hit = this.current && list.find((w) => w.game && w.key === this.current.exe);
      if (!hit) hit = list.find((w) => w.game);
      const next = hit ? { name: hit.game, exe: hit.key } : null;
      if (next?.name !== this.current?.name) {
        this.current = next ? { ...next, since: Date.now() } : null;
        this.onChange(this.current);
      }
    } catch {}
    this.busy = false;
  }
}

module.exports = { GameWatcher, exeKey };
