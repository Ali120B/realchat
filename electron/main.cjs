// chattt — Electron main: overlay window + prefs + global shortcuts + WA service + IPC.
const { app, BrowserWindow, ipcMain, screen, globalShortcut, Menu, nativeImage, Tray, shell, Notification, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { createWaService } = require('./wa-service.cjs')

app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

// Wayland (Hyprland etc.): Electron cannot programmatically move, resize,
// focus, or always-on-top native Wayland windows — the overlay would tile and
// ignore positioning. Run through XWayland instead, where all of that works
// and the toolbar window type floats by default. Opt out with CHATTT_NATIVE_WAYLAND=1.
if (
  process.platform === 'linux' &&
  process.env.WAYLAND_DISPLAY &&
  !process.env.CHATTT_NATIVE_WAYLAND &&
  !app.commandLine.hasSwitch('ozone-platform')
) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
  console.log('[chattt] Wayland detected — using XWayland backend for overlay control')
}

const isDev = !app.isPackaged
const WINDOW_SIZE = 72

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
let alwaysOnTopTimer = null
/** @type {import('electron').Tray | null} */
let tray = null
let wa = null

// ---------- prefs ----------
function prefsPath() {
  return path.join(app.getPath('userData'), 'prefs.json')
}

function loadPrefs() {
  try {
    return { alwaysOnTop: true, launchOnStartup: false, notifications: true, ...JSON.parse(fs.readFileSync(prefsPath(), 'utf8')) }
  } catch {
    return { alwaysOnTop: true, launchOnStartup: false, notifications: true }
  }
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true })
    fs.writeFileSync(prefsPath(), JSON.stringify(prefs))
  } catch {
    // non-fatal
  }
}

function applyLaunchOnStartup(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath })
  } catch {
    // platform may not support it
  }
}

// ---------- window ----------
function getTrayIconPath() {
  return path.join(__dirname, '..', 'build', 'icon.png')
}

function assertAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (loadPrefs().alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  } else {
    mainWindow.setAlwaysOnTop(false)
  }
}

function startAlwaysOnTopRefresh() {
  clearInterval(alwaysOnTopTimer)
  alwaysOnTopTimer = setInterval(assertAlwaysOnTop, 1000)
}

function focusOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  assertAlwaysOnTop()
  mainWindow.setFocusable(true)
  mainWindow.show()
  mainWindow.focus()
  if (process.platform === 'win32') {
    app.focus({ steal: true })
    assertAlwaysOnTop()
  }
  mainWindow.flashFrame(false)
}

function sendToRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('wa:event', payload)
  }
  if (payload && payload.kind === 'notify') {
    const prefs = loadPrefs()
    const chat = payload
    if (prefs.notifications && mainWindow && !mainWindow.isFocused()) {
      try {
        const n = new Notification({ title: chat.title || 'chattt', body: chat.body || '', silent: false })
        n.on('click', focusOverlay)
        n.show()
      } catch {
        // notifications unsupported — badge still updates
      }
      try {
        mainWindow.flashFrame(true)
      } catch {
        // ignore
      }
    }
  }
}

function createTray() {
  if (process.platform !== 'win32' || tray) return
  try {
    const image = nativeImage.createFromPath(getTrayIconPath())
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
    tray.setToolTip('chattt')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show chattt',
          click: () => {
            focusOverlay()
            mainWindow?.webContents.send('global-focus-shortcut')
          },
        },
        { type: 'separator' },
        { label: 'Close (Quit)', click: () => app.quit() },
      ]),
    )
    tray.on('click', focusOverlay)
  } catch {
    // tray icon missing in dev — non-fatal
  }
}

// Alt+/ is the primary toggle (Windows-friendly). Alt+Shift+Space stays as fallback.
function handleGlobalFocusShortcut() {
  focusOverlay()
  mainWindow?.webContents.send('global-focus-shortcut')
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll()
  for (const accel of ['Alt+/', 'Alt+Shift+Space']) {
    try {
      const ok = globalShortcut.register(accel, handleGlobalFocusShortcut)
      console.log(`[chattt] global shortcut ${accel}: ${ok ? 'registered' : 'FAILED'}`)
    } catch (e) {
      console.warn(`[chattt] global shortcut ${accel} error:`, e?.message)
    }
  }
}

function getPreloadPath() {
  const rootDir = path.basename(__dirname) === 'dist-electron' ? __dirname : path.join(__dirname, '..', 'dist-electron')
  return path.join(rootDir, 'preload.cjs')
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const posX = workArea.x + workArea.width - WINDOW_SIZE - 16
  const posY = workArea.y + 100

  mainWindow = new BrowserWindow({
    x: posX,
    y: posY,
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    // resizable:true so programmatic setSize can grow AND shrink (a
    // resizable:false window refuses to shrink on some platforms);
    // will-resize below blocks user-driven resizing instead.
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    fullscreenable: false,
    acceptFirstMouse: true,
    thickFrame: false,
    // Toolbar type: floating utility window on X11/XWayland tiling compositors
    // (Hyprland, Sway, i3). Ignored on other platforms. Frameless => no visible change.
    ...(process.platform === 'linux' ? { type: 'toolbar' } : {}),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  // No user resizing — overlay size is controlled by S/M/L settings only.
  mainWindow.on('will-resize', (e) => {
    e.preventDefault()
  })

  assertAlwaysOnTop()

  if (isDev) {
    mainWindow.loadURL(
      process.env.CHATTT_MOCK ? 'http://localhost:5173/#mock' : 'http://localhost:5173',
    )
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.showInactive()
    startAlwaysOnTopRefresh()
  })

  mainWindow.on('blur', assertAlwaysOnTop)
  mainWindow.on('hide', assertAlwaysOnTop)
  mainWindow.on('show', assertAlwaysOnTop)
  mainWindow.on('focus', () => {
    assertAlwaysOnTop()
    try {
      mainWindow.flashFrame(false)
    } catch {
      // ignore
    }
  })

  mainWindow.on('closed', () => {
    clearInterval(alwaysOnTopTimer)
    alwaysOnTopTimer = null
    mainWindow = null
  })
}

// ---------- IPC: window ----------
ipcMain.on('set-focusable', (_event, focusable) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setFocusable(!!focusable)
  if (focusable) {
    mainWindow.webContents.focus()
    mainWindow.focus()
    if (process.platform === 'win32') {
      app.focus({ steal: true })
      assertAlwaysOnTop()
    }
  }
  assertAlwaysOnTop()
})

ipcMain.on('set-window-position', (_event, x, y) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setPosition(Math.round(x), Math.round(y))
})

ipcMain.handle('get-window-position', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return [0, 0]
  return mainWindow.getPosition()
})

ipcMain.handle('get-workarea', () => {
  try {
    return screen.getPrimaryDisplay().workArea
  } catch {
    return { x: 0, y: 0, width: 1280, height: 720 }
  }
})

ipcMain.on('resize-overlay', (_event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // Top-left stays fixed so the bubble never jumps; then clamp into the work area.
  mainWindow.setSize(Math.round(width), Math.round(height))
  try {
    const wa = screen.getPrimaryDisplay().workArea
    const [x, y] = mainWindow.getPosition()
    const cx = Math.max(wa.x, Math.min(x, wa.x + wa.width - width))
    const cy = Math.max(wa.y, Math.min(y, wa.y + wa.height - height))
    if (cx !== x || cy !== y) mainWindow.setPosition(Math.round(cx), Math.round(cy))
  } catch {
    // ignore
  }
})

ipcMain.handle('open-external', (_event, url) => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(url)
    }
  } catch {
    // invalid url — ignore
  }
})

ipcMain.on('keep-on-top', () => assertAlwaysOnTop())

// ---------- IPC: prefs ----------
ipcMain.handle('prefs:get', () => loadPrefs())
ipcMain.on('prefs:set', (_event, patch) => {
  const prefs = { ...loadPrefs(), ...(patch || {}) }
  savePrefs(prefs)
  if (typeof patch?.launchOnStartup === 'boolean') applyLaunchOnStartup(patch.launchOnStartup)
  assertAlwaysOnTop()
})

// ---------- IPC: WhatsApp ----------
function waHandler(name, fn) {
  ipcMain.handle(name, async (_event, ...args) => {
    try {
      return await fn(...args)
    } catch (e) {
      return { ok: false, error: e?.message || 'failed' }
    }
  })
}

function initWa() {
  const userData = app.getPath('userData')
  wa = createWaService({
    authDir: path.join(userData, 'wa-auth'),
    cacheDir: path.join(userData, 'wa-cache'),
    emit: sendToRenderer,
  })
  waHandler('wa:get-state', () => wa.getState())
  waHandler('wa:get-chats', () => wa.getChats())
  waHandler('wa:get-messages', (chatId) => wa.getMessages(chatId))
  waHandler('wa:send-text', (chatId, body, replyToId) => wa.sendText(chatId, body, replyToId))
  waHandler('wa:react', (chatId, msgId, emoji) => wa.react(chatId, msgId, emoji))
  waHandler('wa:edit', (chatId, msgId, body) => wa.editMessage(chatId, msgId, body))
  waHandler('wa:delete', (chatId, msgId) => wa.deleteMessage(chatId, msgId))
  waHandler('wa:mark-read', (chatId) => wa.markRead(chatId))
  waHandler('wa:pairing-code', (phone) => wa.requestPairingCode(phone))
  waHandler('wa:logout', () => wa.logout())
  waHandler('wa:group-info', (chatId) => wa.groupInfo(chatId))
  waHandler('wa:presence', (chatId, state) => wa.sendPresence(chatId, state))
  waHandler('wa:watch', (chatId) => wa.watchChat(chatId))
  waHandler('wa:get-media', (msgId) => wa.getMedia(msgId))
  waHandler('wa:search-messages', (query, chatId) => wa.searchMessages(query, chatId))
  waHandler('wa:resolve-contact', (query) => wa.resolveContact(query))
  waHandler('wa:start-chat', (jid) => wa.startChat(jid))
  waHandler('wa:show-archived', (show) => wa.setShowArchived(show))
  waHandler('wa:refresh-pic', (chatId) => wa.refreshPic(chatId))
  waHandler('wa:reset-cache', () => wa.resetCache())
  waHandler('wa:debug-twins', () => wa.debugTwins())
  ipcMain.handle('wa:pick-file', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'no-window' }
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Media & documents', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'mp3', 'ogg', 'wav', 'pdf', 'doc', 'docx', 'txt', 'zip'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (res.canceled || res.filePaths.length === 0) return { ok: false, error: 'cancelled' }
    return { ok: true, path: res.filePaths[0] }
  })
  waHandler('wa:send-file', (chatId, filePath) => wa.pickAndSend(chatId, filePath))
  wa.start().catch((e) => console.error('[chattt] wa start failed:', e?.message))
}

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.showInactive()
    }
  })
}

app.whenReady().then(() => {
  applyLaunchOnStartup(loadPrefs().launchOnStartup)
  createWindow()
  createTray()
  registerGlobalShortcuts()
  initWa()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  try {
    wa?.stop()
  } catch {
    // ignore
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
