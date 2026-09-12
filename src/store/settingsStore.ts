import { create } from 'zustand'

interface SettingsState {
  transparency: number // 0.4 - 1 panel opacity multiplier
  blur: number // px backdrop blur override (0 = theme default)
  alwaysOnTop: boolean
  launchOnStartup: boolean
  notifications: boolean
  sound: boolean
  fontSize: number
  showUnread: boolean
  animations: boolean
  set: (patch: Partial<Omit<SettingsState, 'set' | 'load' | 'save' | 'syncFromMain'>>) => void
  load: () => void
  save: () => void
  syncFromMain: () => void
}

const KEY = 'chattt-settings'

const DEFAULTS = {
  transparency: 1,
  blur: 0,
  alwaysOnTop: true,
  launchOnStartup: false,
  notifications: true,
  sound: true,
  fontSize: 14,
  showUnread: true,
  animations: true,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,

  set: (patch) => {
    set(patch)
    get().save()
    applySettings(get())
    // Mirror window-level prefs to the main process (source of truth for the OS)
    const main: Record<string, unknown> = {}
    if (typeof patch.alwaysOnTop === 'boolean') main.alwaysOnTop = patch.alwaysOnTop
    if (typeof patch.launchOnStartup === 'boolean') main.launchOnStartup = patch.launchOnStartup
    if (typeof patch.notifications === 'boolean') main.notifications = patch.notifications
    if (Object.keys(main).length > 0) window.electronAPI?.prefsSet?.(main)
  },

  load: () => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) set({ ...DEFAULTS, ...JSON.parse(raw) })
    } catch {
      // keep defaults
    }
    applySettings(get())
    get().syncFromMain()
  },

  syncFromMain: () => {
    void window.electronAPI?.prefsGet?.().then((p) => {
      if (!p) return
      set({
        alwaysOnTop: p.alwaysOnTop,
        launchOnStartup: p.launchOnStartup,
        notifications: p.notifications,
      })
      get().save()
    }).catch(() => {})
  },

  save: () => {
    const { transparency, blur, alwaysOnTop, launchOnStartup, notifications, sound, fontSize, showUnread, animations } = get()
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ transparency, blur, alwaysOnTop, launchOnStartup, notifications, sound, fontSize, showUnread, animations }),
      )
    } catch {
      // ignore
    }
  },
}))

function applySettings(s: SettingsState) {
  const root = document.documentElement
  root.style.setProperty('--chattt-transparency', String(s.transparency))
  if (s.blur > 0) root.style.setProperty('--glass-window-blur', `${s.blur}px`)
  document.body.style.fontSize = `${s.fontSize}px`
  if (!s.animations) document.body.classList.add('reduce-motion')
  else document.body.classList.remove('reduce-motion')
}
