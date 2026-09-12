// chattt — preload bridge (context-isolated allowlist only).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  setFocusable: (focusable) => {
    ipcRenderer.send('set-focusable', focusable)
  },
  keepOnTop: () => {
    ipcRenderer.send('keep-on-top')
  },
  setPosition: (x, y) => {
    ipcRenderer.send('set-window-position', x, y)
  },
  getPosition: () => ipcRenderer.invoke('get-window-position'),
  getWorkArea: () => ipcRenderer.invoke('get-workarea'),
  resizeOverlay: (width, height) => {
    ipcRenderer.send('resize-overlay', width, height)
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onGlobalFocusShortcut: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('global-focus-shortcut', handler)
    return () => ipcRenderer.removeListener('global-focus-shortcut', handler)
  },
  prefsGet: () => ipcRenderer.invoke('prefs:get'),
  prefsSet: (patch) => {
    ipcRenderer.send('prefs:set', patch)
  },
  // Live WhatsApp service (Baileys in main). Absent in dev:web → renderer uses mock.
  wa: {
    getState: () => ipcRenderer.invoke('wa:get-state'),
    getChats: () => ipcRenderer.invoke('wa:get-chats'),
    getMessages: (chatId) => ipcRenderer.invoke('wa:get-messages', chatId),
    sendText: (chatId, body, replyToId) => ipcRenderer.invoke('wa:send-text', chatId, body, replyToId),
    react: (chatId, msgId, emoji) => ipcRenderer.invoke('wa:react', chatId, msgId, emoji),
    edit: (chatId, msgId, body) => ipcRenderer.invoke('wa:edit', chatId, msgId, body),
    remove: (chatId, msgId) => ipcRenderer.invoke('wa:delete', chatId, msgId),
    markRead: (chatId) => ipcRenderer.invoke('wa:mark-read', chatId),
    pairingCode: (phone) => ipcRenderer.invoke('wa:pairing-code', phone),
    logout: () => ipcRenderer.invoke('wa:logout'),
    groupInfo: (chatId) => ipcRenderer.invoke('wa:group-info', chatId),
    presence: (chatId, state) => ipcRenderer.invoke('wa:presence', chatId, state),
    watch: (chatId) => ipcRenderer.invoke('wa:watch', chatId),
    getMedia: (msgId) => ipcRenderer.invoke('wa:get-media', msgId),
    searchMessages: (query, chatId) => ipcRenderer.invoke('wa:search-messages', query, chatId),
    resolveContact: (query) => ipcRenderer.invoke('wa:resolve-contact', query),
    startChat: (jid, name) => ipcRenderer.invoke('wa:start-chat', jid, name),
    showArchived: (show) => ipcRenderer.invoke('wa:show-archived', show),
    refreshPic: (chatId) => ipcRenderer.invoke('wa:refresh-pic', chatId),
    resetCache: () => ipcRenderer.invoke('wa:reset-cache'),
    debugTwins: () => ipcRenderer.invoke('wa:debug-twins'),
    pickFile: () => ipcRenderer.invoke('wa:pick-file'),
    sendFile: (chatId, filePath) => ipcRenderer.invoke('wa:send-file', chatId, filePath),
    onEvent: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('wa:event', handler)
      return () => ipcRenderer.removeListener('wa:event', handler)
    },
  },
  platform: process.platform,
})
