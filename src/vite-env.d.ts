/// <reference types="vite/client" />

interface WaResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

interface WaBridge {
  getState: () => Promise<{ connection: string; qr: string | null; showArchived?: boolean; archived?: number; hasSession?: boolean }>
  getChats: () => Promise<unknown[]>
  getMessages: (chatId: string) => Promise<unknown[]>
  sendText: (chatId: string, body: string, replyToId?: string | null) => Promise<WaResult>
  react: (chatId: string, msgId: string, emoji: string) => Promise<WaResult>
  edit: (chatId: string, msgId: string, body: string) => Promise<WaResult>
  remove: (chatId: string, msgId: string) => Promise<WaResult>
  markRead: (chatId: string) => Promise<WaResult>
  pairingCode: (phone: string) => Promise<WaResult>
  logout: () => Promise<WaResult>
  groupInfo: (chatId: string) => Promise<WaResult>
  presence: (chatId: string, state: string) => Promise<WaResult>
  watch: (chatId: string) => Promise<WaResult>
  getMedia: (msgId: string) => Promise<WaResult>
  searchMessages: (query: string, chatId?: string | null) => Promise<unknown[] | WaResult>
  resolveContact: (query: string) => Promise<WaResult>
  startChat: (jid: string) => Promise<WaResult>
  showArchived: (show: boolean) => Promise<WaResult>
  refreshPic: (chatId: string) => Promise<WaResult>
  pickFile: () => Promise<WaResult>
  sendFile: (chatId: string, filePath: string) => Promise<WaResult>
  onEvent: (callback: (payload: { kind: string; [key: string]: unknown }) => void) => () => void
}

interface ElectronAPI {
  setFocusable?: (focusable: boolean) => void
  keepOnTop?: () => void
  setPosition?: (x: number, y: number) => void
  getPosition?: () => Promise<[number, number]>
  getWorkArea?: () => Promise<{ x: number; y: number; width: number; height: number }>
  resizeOverlay?: (width: number, height: number) => void
  openExternal?: (url: string) => void
  onGlobalFocusShortcut?: (callback: () => void) => () => void
  prefsGet?: () => Promise<{ alwaysOnTop: boolean; launchOnStartup: boolean; notifications: boolean }>
  prefsSet?: (patch: Record<string, unknown>) => void
  wa?: WaBridge
  platform: NodeJS.Platform
}

interface Window {
  electronAPI?: ElectronAPI
}
