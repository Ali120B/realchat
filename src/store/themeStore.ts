import { create } from 'zustand'

export interface ThemeOption {
  id: string
  label: string
  hex: string
  rgb: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'ocean', label: 'Ocean Blue', hex: '#00B4FF', rgb: '0, 180, 255' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981', rgb: '16, 185, 129' },
  { id: 'violet', label: 'Violet', hex: '#8B5CF6', rgb: '139, 92, 246' },
  { id: 'rose', label: 'Rose', hex: '#F43F5E', rgb: '244, 63, 94' },
  { id: 'amber', label: 'Amber', hex: '#F59E0B', rgb: '245, 158, 11' },
  { id: 'cyan', label: 'Cyan', hex: '#06B6D4', rgb: '6, 182, 212' },
  { id: 'lime', label: 'Lime', hex: '#84CC16', rgb: '132, 204, 22' },
]

const STORAGE_KEY = 'chattt-theme'

function getStoredTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'ocean'
  } catch {
    return 'ocean'
  }
}

function applyThemeToDOM(themeId: string) {
  const theme = THEME_OPTIONS.find((t) => t.id === themeId) ?? THEME_OPTIONS[0]!
  const root = document.documentElement
  root.style.setProperty('--color-accent', theme.hex)
  root.style.setProperty('--accent-rgb', theme.rgb)
  root.style.setProperty('--bubble-outgoing', `rgba(${theme.rgb}, 0.42)`)
}

interface ThemeState {
  activeTheme: string
  setTheme: (themeId: string) => void
  initTheme: () => void
  getAccentHex: () => string
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeTheme: getStoredTheme(),

  setTheme: (themeId) => {
    set({ activeTheme: themeId })
    applyThemeToDOM(themeId)
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      // ignore
    }
  },

  initTheme: () => {
    applyThemeToDOM(get().activeTheme)
  },

  getAccentHex: () => {
    const theme = THEME_OPTIONS.find((t) => t.id === get().activeTheme)
    return theme?.hex ?? '#00B4FF'
  },
}))
