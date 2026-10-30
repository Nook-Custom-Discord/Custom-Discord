const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nook', {
  isElectron: true,
  globalHotkeys: true,
  platform: process.platform,
  getSources: (types) => ipcRenderer.invoke('get-sources', types),
  selectSource: (id, audio) => ipcRenderer.invoke('select-source', id, audio),
  host: {
    status: () => ipcRenderer.invoke('host-status'),
    start: (port) => ipcRenderer.invoke('host-start', port),
    stop: () => ipcRenderer.invoke('host-stop'),
  },
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (c) => ipcRenderer.invoke('set-config', c),
  setBadge: (n) => ipcRenderer.send('set-badge', n),
  flash: () => ipcRenderer.send('flash'),
  show: () => ipcRenderer.send('show'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setTitleBar: (color, symbolColor) => ipcRenderer.send('titlebar', { color, symbolColor }),
  setTransparent: (on) => ipcRenderer.send('set-transparent', !!on),
  setWindowMode: (mode) => ipcRenderer.send('set-window-mode', mode),
  liveGlass: (on) => ipcRenderer.invoke('live-glass', !!on),
  liveProtect: (on) => ipcRenderer.invoke('live-protect', !!on),
  isFocused: () => ipcRenderer.invoke('is-focused'),
  idleTime: () => ipcRenderer.invoke('idle-time'),
  notify: (opts) => ipcRenderer.send('notify', opts),
  games: {
    watch: (on) => ipcRenderer.invoke('games-watch', !!on),
    running: () => ipcRenderer.invoke('games-running'),
    custom: (o) => ipcRenderer.invoke('games-custom', o),
  },
  clips: {
    prepare: () => ipcRenderer.invoke('clip-prepare'),
    save: (bytes, name) => ipcRenderer.invoke('clip-save', bytes, name),
    list: () => ipcRenderer.invoke('clip-list'),
    open: (p) => ipcRenderer.invoke('clip-open', p),
    show: (p) => ipcRenderer.invoke('clip-show', p),
    folder: () => ipcRenderer.invoke('clip-folder'),
    remove: (p) => ipcRenderer.invoke('clip-remove', p),
    read: (p) => ipcRenderer.invoke('clip-read', p),
    chooseDir: () => ipcRenderer.invoke('clip-choose-dir'),
    hotkey: (accel) => ipcRenderer.invoke('clip-hotkey', accel || ''),
    voice: (on) => ipcRenderer.invoke('clip-voice', !!on),
  },
  on: (channel, fn) => {
    const ok = ['focus', 'notification-click', 'system-idle', 'hotkey', 'live-geom', 'game', 'clip-voice'];
    if (!ok.includes(channel)) return;
    ipcRenderer.on(channel, (e, ...args) => fn(...args));
  },
});
