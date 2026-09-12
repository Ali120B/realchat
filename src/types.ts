// Shared domain types (renderer + future src-main). IPC channel names live here too.

export type ConnState = 'connecting' | 'qr' | 'syncing' | 'ready' | 'offline' | 'logged-out'

export interface Chat {
  id: string
  name: string
  pic?: string | null
  isGroup: boolean
  lastMsg: string
  ts: number
  unread: number
  muted: boolean
  pinned: boolean
  archived?: boolean
  online?: boolean
}

export type MsgType = 'text' | 'image' | 'voice' | 'video' | 'doc' | 'sticker' | 'location' | 'contact'
export type MsgStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface Msg {
  id: string
  chatId: string
  fromMe: boolean
  senderName?: string
  senderJid?: string
  body: string
  type: MsgType
  ts: number
  status: MsgStatus
  replyTo?: string | null
  reaction?: string | null
  edited?: boolean
  starred?: boolean
  deleted?: boolean
  thumb?: string | null
  hasMedia?: boolean
}

export type AppView = 'home' | 'chat' | 'settings' | 'newChat'
export type OverlaySize = 'S' | 'M' | 'L'

export interface Position {
  x: number
  y: number
}

export type SnapSide = 'left' | 'right'

export const WA_IPC = {
  getState: 'wa:get-state',
  getChats: 'wa:get-chats',
  getMessages: 'wa:get-messages',
  event: 'wa:event',
} as const

export const OVERLAY_DIMENSIONS: Record<OverlaySize, { width: number; height: number }> = {
  S: { width: 380, height: 340 },
  M: { width: 420, height: 480 },
  L: { width: 520, height: 600 },
}

// Window chrome: when open, the bubble hides and the panel fills the window
// exactly; when closed, the window is just the bubble. No gap math anywhere.
export const CLOSED_SIZE = 72

export function windowSizeFor(size: OverlaySize, open: boolean): { width: number; height: number } {
  if (!open) return { width: CLOSED_SIZE, height: CLOSED_SIZE }
  const d = OVERLAY_DIMENSIONS[size]
  return { width: d.width, height: d.height }
}
