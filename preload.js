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
  isFocused: () => ipcRenderer.invoke('is-focused'),
  idleTime: () => ipcRenderer.invoke('idle-time'),
  notify: (opts) => ipcRenderer.send('notify', opts),
  on: (channel, fn) => {
    const ok = ['focus', 'notification-click', 'system-idle', 'hotkey', 'live-geom'];
    if (!ok.includes(channel)) return;
    ipcRenderer.on(channel, (e, ...args) => fn(...args));
  },
});
