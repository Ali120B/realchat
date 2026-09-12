import { create } from 'zustand'
import type { Chat, ConnState, Msg } from '@/types'
import { useToastStore } from '@/store/toastStore'
import { useUiStore } from '@/store/uiStore'
import { playBeep } from '@/services/sound'

const MOCK_CHATS: Chat[] = [
  { id: '1', name: 'Alex', isGroup: false, lastMsg: 'Hey, what’s up?', ts: Date.now() - 60_000, unread: 2, muted: false, pinned: true, online: true },
  { id: '2', name: 'Family', isGroup: true, lastMsg: 'Mom: Dinner at 8', ts: Date.now() - 600_000, unread: 0, muted: true, pinned: false },
  { id: '3', name: 'John', isGroup: false, lastMsg: '👍', ts: Date.now() - 3_600_000, unread: 0, muted: false, pinned: false },
]

const MOCK_MSGS: Record<string, Msg[]> = {
  '1': [
    { id: 'm1', chatId: '1', fromMe: false, body: 'Hey, what’s up?', type: 'text', ts: Date.now() - 120_000, status: 'read' },
    { id: 'm2', chatId: '1', fromMe: true, body: 'All good — testing chattt overlay', type: 'text', ts: Date.now() - 60_000, status: 'read' },
  ],
}

export interface Presence {
  from: string
  state: string
  at: number
  online?: boolean
}

export interface ContactResult {
  exists: boolean
  jid: string | null
  name: string | null
}

interface WaState {
  live: boolean
  connection: ConnState
  hasSession: boolean
  qrDataUrl: string | null
  chats: Chat[]
  archivedCount: number
  showArchived: boolean
  messagesByChat: Record<string, Msg[]>
  presenceByChat: Record<string, Presence>
  activeChatId: string | null
  search: string
  replyToId: string | null
  mediaByMsg: Record<string, string>
  pairingCode: string | null
  pairingError: string | null
  contactResult: ContactResult | null
  contactError: string | null
  contactLoading: boolean
  connect: () => () => void
  previewLinked: () => void
  setActiveChat: (id: string | null) => void
  setSearch: (s: string) => void
  setReplyTo: (id: string | null) => void
  sendText: (chatId: string, body: string) => void
  react: (chatId: string, msgId: string, emoji: string) => void
  editMessage: (chatId: string, msgId: string, body: string) => void
  deleteMessage: (chatId: string, msgId: string) => void
  getMedia: (msgId: string) => Promise<string | null>
  pickAndSend: (chatId: string) => void
  requestPairing: (phone: string) => void
  logout: () => void
  pokePresence: (chatId: string, state: string) => void
  resolveContact: (query: string) => void
  clearContact: () => void
  startChat: (jid: string) => void
  toggleArchived: () => void
  refreshPic: (chatId: string) => void
  resetCache: () => void
  logDiagnostics: () => void
  totalUnread: () => number
}

function failMsg(err: unknown): string {
  const e = (err as { error?: string; message?: string }) || {}
  const code = e.error || e.message || 'failed'
  const map: Record<string, string> = {
    'not-connected': 'Still connecting — try again in a moment.',
    'logged-out': 'Logged out — scan the QR to link again.',
    'message-not-found': 'Message no longer available.',
    'media-too-large': 'Media too large for the overlay (12MB cap).',
    'invalid-phone': 'Enter a full international number, e.g. +15551234567.',
    'cancelled': 'Cancelled.',
  }
  return map[code] || `Something went wrong (${code}).`
}

export const useWaStore = create<WaState>((set, get) => {
  const isMockHash = () => window.location.hash.includes('mock')
  const api = () => (isMockHash() ? undefined : window.electronAPI?.wa)

  function mergeMessages(chatId: string, incoming: Msg[], reset: boolean) {
    set((s) => {
      const base = reset ? [] : s.messagesByChat[chatId] ?? []
      const seen = new Set(base.map((m) => m.id))
      const merged = [...base]
      for (const m of incoming) {
        if (!m.id || seen.has(m.id)) continue
        seen.add(m.id)
        merged.push(m)
      }
      merged.sort((a, b) => a.ts - b.ts)
      return { messagesByChat: { ...s.messagesByChat, [chatId]: merged.slice(-300) } }
    })
  }

  return {
    live: !!window.electronAPI?.wa,
    connection: 'connecting',
    hasSession: false,
    qrDataUrl: null,
    chats: [],
    archivedCount: 0,
    showArchived: false,
    messagesByChat: {},
    presenceByChat: {},
    activeChatId: null,
    search: '',
    replyToId: null,
    mediaByMsg: {},
    pairingCode: null,
    pairingError: null,
    contactResult: null,
    contactError: null,
    contactLoading: false,

    connect: () => {
      const forceMock = window.location.hash.includes('mock')
      const bridge = forceMock ? undefined : api()
      if (!bridge) {
        // dev:web or #mock — mock mode, QR preview screen
        set({ live: false, connection: 'qr', chats: MOCK_CHATS, messagesByChat: MOCK_MSGS })
        if (forceMock) {
          // Instant linked UI for screenshots / UI dev: #mock alone, no click needed
          setTimeout(() => {
            get().previewLinked()
            get().setActiveChat('1')
            try {
              const ui = useUiStore.getState()
              ui.setView('chat')
              ui.openWindow()
            } catch {
              // ui store unavailable (tests)
            }
          }, 300)
        }
        return () => {}
      }
      set({ live: true })
      void bridge.getState().then((st) => {
        const patch: Partial<WaState> = {}
        if (st.connection) patch.connection = st.connection as ConnState
        if ('qr' in st) patch.qrDataUrl = (st.qr as string) || null
        if (typeof st.showArchived === 'boolean') patch.showArchived = st.showArchived
        if (typeof st.archived === 'number') patch.archivedCount = st.archived
        if (typeof st.hasSession === 'boolean') patch.hasSession = st.hasSession
        set(patch)
      }).catch(() => {})
      void bridge.getChats().then((chats) => {
        if (Array.isArray(chats)) set({ chats: chats as Chat[] })
      }).catch(() => {})

      const off = bridge.onEvent((payload) => {
        switch (payload.kind) {
          case 'connection': {
            const state = payload.state as ConnState
            const wasReady = get().connection === 'ready'
            set({ connection: state })
            if (state !== 'ready' && wasReady) {
              // Fresh session — drop stale presence/online states
              set({ presenceByChat: {} })
            }
            if (state === 'ready') {
              set({ qrDataUrl: null, pairingCode: null })
              void bridge.getChats().then((chats) => {
                if (Array.isArray(chats)) set({ chats: chats as Chat[] })
              }).catch(() => {})
            }
            if (state === 'logged-out') {
              set({ chats: [], messagesByChat: {}, activeChatId: null, pairingCode: null })
            }
            break
          }
          case 'qr':
            set({ qrDataUrl: (payload.dataUrl as string) || null, pairingCode: null })
            break
          case 'chats': {
            const patch: Partial<WaState> = { chats: (payload.chats as Chat[]) || [] }
            if (typeof payload.archived === 'number') patch.archivedCount = payload.archived
            set(patch)
            break
          }
          case 'messages': {
            const chatId = payload.chatId as string
            const list = (payload.messages as Msg[]) || []
            mergeMessages(chatId, list, !!payload.reset)
            // Auto-mark read when the chat is open
            if (get().activeChatId === chatId && !payload.reset) {
              void bridge.markRead(chatId).catch(() => {})
            }
            break
          }
          case 'message-update': {
            const chatId = payload.chatId as string
            const msg = payload.message as Msg
            if (!chatId || !msg) break
            set((s) => ({
              messagesByChat: {
                ...s.messagesByChat,
                [chatId]: (s.messagesByChat[chatId] || []).map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
              },
            }))
            break
          }
          case 'message-deleted': {
            const chatId = payload.chatId as string
            const msgId = payload.msgId as string
            if (!chatId || !msgId) break
            set((s) => ({
              messagesByChat: {
                ...s.messagesByChat,
                [chatId]: (s.messagesByChat[chatId] || []).filter((m) => m.id !== msgId),
              },
            }))
            break
          }
          case 'presence': {
            const chatId = payload.chatId as string
            if (!chatId) break
            const online = typeof payload.online === 'boolean' ? (payload.online as boolean) : undefined
            const presence: Presence = { from: String(payload.from || ''), state: String(payload.state || ''), at: Date.now(), online }
            set((s) => ({
              presenceByChat: { ...s.presenceByChat, [chatId]: presence },
              // Mirror online state onto the chat row for the list dot
              chats: typeof online === 'boolean' ? s.chats.map((c) => (c.id === chatId ? { ...c, online } : c)) : s.chats,
            }))
            // Typing flags clear fast; online flags go stale slowly
            const ttl = presence.state === 'composing' || presence.state === 'recording' ? 6000 : 120000
            setTimeout(() => {
              const cur = get().presenceByChat[chatId]
              if (cur && cur.at === presence.at) {
                set((s) => {
                  const next = { ...s.presenceByChat }
                  delete next[chatId]
                  return {
                    presenceByChat: next,
                    chats: s.chats.map((c) => (c.id === chatId ? { ...c, online: false } : c)),
                  }
                })
              }
            }, ttl)
            break
          }
          case 'notify': {
            try {
              const sound = localStorage.getItem('chattt-settings')
              if (!sound || JSON.parse(sound).sound !== false) playBeep()
            } catch {
              playBeep()
            }
            break
          }
          default:
            break
        }
      })
      return off
    },

    previewLinked: () => set({ live: false, connection: 'ready', chats: MOCK_CHATS, messagesByChat: MOCK_MSGS }),

    setActiveChat: (id) => {
      set({ activeChatId: id, replyToId: null })
      const bridge = api()
      if (id && bridge) {
        void bridge.watch(id).catch(() => {})
        void bridge.getMessages(id).then((list) => {
          if (Array.isArray(list)) mergeMessages(id, list as Msg[], true)
        }).catch(() => {})
        void bridge.markRead(id).catch(() => {})
      } else if (id && !bridge) {
        // mock: clear unread badge
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) }))
      }
    },

    setSearch: (search) => set({ search }),
    setReplyTo: (replyToId) => set({ replyToId }),

    sendText: (chatId, body) => {
      const bridge = api()
      const text = body.trim()
      if (!text) return
      if (!bridge) {
        const msg: Msg = { id: `local-${Date.now()}`, chatId, fromMe: true, body: text, type: 'text', ts: Date.now(), status: 'sent' }
        const replyToId = get().replyToId
        if (replyToId) msg.replyTo = replyToId
        set((s) => ({
          messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] ?? []), msg] },
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, lastMsg: text, ts: Date.now() } : c)),
          replyToId: null,
        }))
        return
      }
      const replyToId = get().replyToId
      set({ replyToId: null })
      void bridge.sendText(chatId, text, replyToId).then((res) => {
        if (!res?.ok) {
          useToastStore.getState().push(failMsg(res), 'error')
        } else if (res.chatId && res.chatId !== chatId) {
          // Server filed the message under the canonical twin — follow it
          get().setActiveChat(String(res.chatId))
        }
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    react: (chatId, msgId, emoji) => {
      const bridge = api()
      if (!bridge) return
      void bridge.react(chatId, msgId, emoji).then((res) => {
        if (!res?.ok) useToastStore.getState().push(failMsg(res), 'error')
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    editMessage: (chatId, msgId, body) => {
      const bridge = api()
      if (!bridge) return
      void bridge.edit(chatId, msgId, body).then((res) => {
        if (res?.ok) {
          set((s) => ({
            messagesByChat: {
              ...s.messagesByChat,
              [chatId]: (s.messagesByChat[chatId] || []).map((m) => (m.id === msgId ? { ...m, body, edited: true } : m)),
            },
          }))
        } else {
          useToastStore.getState().push(failMsg(res), 'error')
        }
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    deleteMessage: (chatId, msgId) => {
      const bridge = api()
      if (!bridge) {
        set((s) => ({
          messagesByChat: {
            ...s.messagesByChat,
            [chatId]: (s.messagesByChat[chatId] || []).filter((m) => m.id !== msgId),
          },
        }))
        return
      }
      void bridge.remove(chatId, msgId).then((res) => {
        if (!res?.ok) useToastStore.getState().push(failMsg(res), 'error')
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    getMedia: async (msgId) => {
      const cached = get().mediaByMsg[msgId]
      if (cached) return cached
      const bridge = api()
      if (!bridge) return null
      try {
        const res = await bridge.getMedia(msgId)
        if (res?.ok && res.data) {
          const url = `data:${res.mime};base64,${res.data}`
          set((s) => ({ mediaByMsg: { ...s.mediaByMsg, [msgId]: url } }))
          return url
        }
        useToastStore.getState().push(failMsg(res), 'error')
      } catch (e) {
        useToastStore.getState().push(failMsg(e), 'error')
      }
      return null
    },

    pickAndSend: (chatId) => {
      const bridge = api()
      if (!bridge) {
        useToastStore.getState().push('File sending needs the desktop app.', 'error')
        return
      }
      void bridge.pickFile().then((picked) => {
        if (!picked?.ok || !picked.path) {
          if (picked?.error && picked.error !== 'cancelled') useToastStore.getState().push(failMsg(picked), 'error')
          return
        }
        void bridge.sendFile(chatId, String(picked.path)).then((res) => {
          if (!res?.ok) useToastStore.getState().push(failMsg(res), 'error')
        }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    requestPairing: (phone) => {
      const bridge = api()
      if (!bridge) return
      set({ pairingCode: null, pairingError: null })
      void bridge.pairingCode(phone).then((res) => {
        if (res?.ok && res.code) set({ pairingCode: String(res.code), pairingError: null })
        else set({ pairingError: failMsg(res), pairingCode: null })
      }).catch((e) => set({ pairingError: failMsg(e), pairingCode: null }))
    },

    logout: () => {
      const bridge = api()
      if (!bridge) {
        set({ connection: 'qr', chats: [], messagesByChat: {}, activeChatId: null })
        return
      }
      void bridge.logout().catch(() => {})
    },

    pokePresence: (chatId, state) => {
      const bridge = api()
      if (!bridge || !chatId) return
      void bridge.presence(chatId, state).catch(() => {})
    },

    resolveContact: (query) => {
      const bridge = api()
      if (!bridge) return
      set({ contactLoading: true, contactResult: null, contactError: null })
      void bridge.resolveContact(query).then((res) => {
        if (res?.ok) {
          set({
            contactLoading: false,
            contactResult: { exists: !!res.exists, jid: (res.jid as string) || null, name: (res.name as string) || null },
            contactError: res.exists ? null : 'Number is not on WhatsApp.',
          })
        } else {
          set({ contactLoading: false, contactError: failMsg(res) })
        }
      }).catch((e) => set({ contactLoading: false, contactError: failMsg(e) }))
    },

    clearContact: () => set({ contactResult: null, contactError: null, contactLoading: false }),

    startChat: (jid) => {
      const bridge = api()
      if (!bridge || !jid) return
      void bridge.startChat(jid).then((res) => {
        if (res?.ok && res.chat) {
          const chat = res.chat as Chat
          set((s) => ({
            chats: s.chats.some((c) => c.id === chat.id) ? s.chats : [chat, ...s.chats],
            activeChatId: chat.id,
            contactResult: null,
            contactError: null,
          }))
        } else {
          useToastStore.getState().push(failMsg(res), 'error')
        }
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    toggleArchived: () => {
      const bridge = api()
      const next = !get().showArchived
      if (!bridge) {
        set({ showArchived: next })
        return
      }
      void bridge.showArchived(next).then((res) => {
        if (res?.ok) {
          set({ showArchived: !!res.showArchived, archivedCount: (res.archived as number) ?? get().archivedCount })
        }
      }).catch(() => {})
    },

    refreshPic: (chatId) => {
      const bridge = api()
      if (!bridge || !chatId) return
      void bridge.refreshPic(chatId).catch(() => {})
    },

    resetCache: () => {
      const bridge = api()
      if (!bridge) return
      // Local wipe (login kept) → full resync; clears stale twins for good
      set({ chats: [], messagesByChat: {}, activeChatId: null, connection: 'syncing' })
      void bridge.resetCache().catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    logDiagnostics: () => {
      const bridge = api()
      if (!bridge) return
      void bridge.debugTwins().then((res) => {
        useToastStore.getState().push(
          res?.ok ? `Diagnostics in terminal: ${res.twins} twin groups, ${res.stuckLids} unresolved` : failMsg(res),
          res?.ok ? 'info' : 'error',
        )
      }).catch((e) => useToastStore.getState().push(failMsg(e), 'error'))
    },

    totalUnread: () => get().chats.reduce((a, c) => a + c.unread, 0),
  }
})
