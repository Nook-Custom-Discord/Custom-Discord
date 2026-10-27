// Electron-Hauptprozess
const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, Tray, Menu, nativeImage, systemPreferences, Notification, powerMonitor, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

if (process.platform === 'darwin') app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowInputVolumeAdjustment');
app.setAppUserModelId('com.nook.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const configFile = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return { host: { enabled: false, port: 3500 }, closeToTray: true };
  }
}
function writeConfig(c) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(c, null, 2));
}

let win = null;
let tray = null;
let quitting = false;
let hosted = null;
let config = null;
let pendingSource = null;
let lastSources = new Map();

const iconPath = path.join(__dirname, 'build', 'icon.png');

async function startHost(port) {
  if (hosted) return { running: true, port: hosted.port };
  const { startServer } = require('./server/index.js');
  hosted = await startServer({ port, dataDir: path.join(app.getPath('userData'), 'server-data') });
  return { running: true, port };
}

async function stopHost() {
  if (hosted) await hosted.close();
  hosted = null;
}

function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

// Durchsichtiges Fenster (Desktop scheint durch): Windows 11 22H2+ (Acryl) und macOS (Vibrancy)
const transparentSupported = () => process.platform === 'darwin' || (process.platform === 'win32' && Number(os.release().split('.')[2] || 0) >= 22621);
function applyTransparency(on) {
  if (!win || !transparentSupported()) return;
  try {
    if (process.platform === 'darwin') win.setVibrancy(on ? 'under-window' : null);
    else win.setBackgroundMaterial(on ? 'acrylic' : 'none');
    win.setBackgroundColor(on ? '#00000000' : '#0d0f14');
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0f14',
    show: false,
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: '#0d0f14', symbolColor: '#c9cdd8', height: 52 },
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });
  if (config.transparent) applyTransparency(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // Testmodus: NOOK_SCREENSHOT=pfad.png speichert nach dem Laden einen Screenshot und beendet die App
  if (process.env.NOOK_SCREENSHOT) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.NOOK_SCREENSHOT, img.toPNG());
        const ui = await win.webContents.executeJavaScript('JSON.stringify({ v: window.__NOOK_UI_V, remote: window.__NOOK_REMOTE_UI || null })').catch(() => 'n/a');
        fs.writeFileSync(process.env.NOOK_SCREENSHOT + '.txt', String(ui));
        quitting = true;
        app.quit();
      }, 4000)
    );
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.on('close', (e) => {
    if (!quitting && config.closeToTray !== false) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('focus', () => {
    win.flashFrame(false);
    win.webContents.send('focus', true);
  });
  win.on('blur', () => win.webContents.send('focus', false));
}

function createTray() {
  let img = nativeImage.createFromPath(iconPath);
  img = img.resize({ width: process.platform === 'darwin' ? 18 : 16 });
  tray = new Tray(img);
  tray.setToolTip('Nook');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Nook öffnen', click: () => { win.show(); win.focus(); } },
      { type: 'separator' },
      { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on('click', () => { win.show(); win.focus(); });
}

app.on('second-instance', () => {
  if (win) {
    win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  config = readConfig();
  if (config.host?.enabled) {
    try {
      await startHost(config.host.port || 3500);
    } catch (e) {
      console.error('Host-Server konnte nicht starten:', e.message);
    }
  }

  const ses = session.defaultSession;
  const allowed = ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture', 'speaker-selection', 'idle-detection'];
  ses.setPermissionRequestHandler(async (wc, permission, cb, details) => {
    if (permission === 'media' && process.platform === 'darwin') {
      for (const t of details.mediaTypes || []) {
        const kind = t === 'video' ? 'camera' : 'microphone';
        if (systemPreferences.getMediaAccessStatus(kind) !== 'granted') await systemPreferences.askForMediaAccess(kind);
      }
    }
    cb(allowed.includes(permission));
  });
  ses.setPermissionCheckHandler((wc, permission) => allowed.includes(permission));

  // Bildschirmfreigabe: Renderer wählt vorher über unseren eigenen Picker eine Quelle
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const sel = pendingSource;
    pendingSource = null;
    const src = sel && lastSources.get(sel.id);
    if (!src) return callback({});
    const res = { video: src };
    if (sel.audio) res.audio = 'loopback';
    callback(res);
  });

  createWindow();
  createTray();

  // Globale Tastenkürzel wie bei Discord: Mikro & Ton auch im Spiel umschalten
  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => win?.webContents.send('hotkey', 'mute'));
    globalShortcut.register('CommandOrControl+Shift+D', () => win?.webContents.send('hotkey', 'deafen'));
  } catch {}

  powerMonitor.on('lock-screen', () => win?.webContents.send('system-idle', true));
  powerMonitor.on('unlock-screen', () => win?.webContents.send('system-idle', false));

  app.on('activate', () => {
    if (win) win.show();
  });
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  if (hosted) await stopHost();
});

// ---------- IPC ----------
ipcMain.handle('get-sources', async (e, types = ['screen', 'window']) => {
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    // macOS fragt beim ersten Mal selbst nach; wir liefern trotzdem die Liste
  }
  const sources = await desktopCapturer.getSources({ types, thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true });
  lastSources = new Map(sources.map((s) => [s.id, s]));
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
    icon: s.appIcon ? s.appIcon.toDataURL() : null,
    isScreen: s.id.startsWith('screen:'),
  }));
});
ipcMain.handle('select-source', (e, id, audio) => {
  pendingSource = { id, audio: !!audio };
  return true;
});
ipcMain.handle('host-status', () => ({ running: !!hosted, port: hosted?.port || config.host?.port || 3500, enabled: !!config.host?.enabled, ips: localIPs() }));
ipcMain.handle('host-start', async (e, port = 3500) => {
  try {
    const r = await startHost(Number(port) || 3500);
    config.host = { enabled: true, port: Number(port) || 3500 };
    writeConfig(config);
    return { ...r, ips: localIPs() };
  } catch (err) {
    return { running: false, error: err.code === 'EADDRINUSE' ? 'Port ist schon belegt' : err.message };
  }
});
ipcMain.handle('host-stop', async () => {
  await stopHost();
  config.host = { ...(config.host || {}), enabled: false };
  writeConfig(config);
  return { running: false };
});
ipcMain.handle('get-config', () => ({ closeToTray: config.closeToTray !== false, autoStart: app.getLoginItemSettings().openAtLogin, version: app.getVersion(), platform: process.platform, transparentSupported: transparentSupported(), transparent: !!config.transparent }));
ipcMain.on('set-transparent', (e, on) => {
  if (!!config.transparent === !!on) return;
  config.transparent = !!on;
  writeConfig(config);
  applyTransparency(!!on);
});
ipcMain.handle('set-config', (e, c) => {
  if (c.closeToTray !== undefined) config.closeToTray = !!c.closeToTray;
  if (c.autoStart !== undefined) app.setLoginItemSettings({ openAtLogin: !!c.autoStart, openAsHidden: true });
  writeConfig(config);
  return true;
});
ipcMain.on('set-badge', (e, count) => {
  if (process.platform === 'darwin') app.dock?.setBadge(count ? String(count) : '');
  else app.setBadgeCount?.(count);
  tray?.setToolTip(count ? `Nook – ${count} ungelesen` : 'Nook');
});
ipcMain.on('flash', () => {
  if (win && !win.isFocused()) win.flashFrame(true);
});
ipcMain.on('show', () => {
  win?.show();
  win?.focus();
});
ipcMain.on('open-external', (e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.on('titlebar', (e, { color, symbolColor }) => {
  if (process.platform !== 'darwin' && win?.setTitleBarOverlay) {
    try {
      win.setTitleBarOverlay({ color, symbolColor, height: 52 });
    } catch {}
  }
});
ipcMain.handle('is-focused', () => !!win?.isFocused());
ipcMain.handle('idle-time', () => powerMonitor.getSystemIdleTime());
ipcMain.on('notify', (e, { title, body, icon, tag }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: true, icon: icon ? nativeImage.createFromDataURL(icon) : nativeImage.createFromPath(iconPath) });
  n.on('click', () => {
    win.show();
    win.focus();
    win.webContents.send('notification-click', tag);
  });
  n.show();
});
