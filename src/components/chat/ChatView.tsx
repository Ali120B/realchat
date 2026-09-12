import { useEffect, useMemo, useRef, useState } from 'react'
import { useWaStore } from '@/store/waStore'
import { useUiStore } from '@/store/uiStore'
import { useToastStore } from '@/store/toastStore'
import { Avatar } from '@/components/common/Avatar'
import { EmojiPicker } from '@/components/chat/EmojiPicker'
import type { Msg } from '@/types'

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍']

function Ticks({ status }: { status: string }) {
  const color = status === 'read' ? 'text-sky-400' : 'text-[var(--color-text-secondary)]'
  return <span className={`text-[10px] ${color}`}>{status === 'sent' ? '✓' : '✓✓'}</span>
}

function dayLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString()
}

export function ChatView() {
  const activeChatId = useWaStore((s) => s.activeChatId)
  const chats = useWaStore((s) => s.chats)
  const messagesByChat = useWaStore((s) => s.messagesByChat)
  const presence = useWaStore((s) => (activeChatId ? s.presenceByChat[activeChatId] : undefined))
  const sendText = useWaStore((s) => s.sendText)
  const react = useWaStore((s) => s.react)
  const editMessage = useWaStore((s) => s.editMessage)
  const deleteMessage = useWaStore((s) => s.deleteMessage)
  const pickAndSend = useWaStore((s) => s.pickAndSend)
  const pokePresence = useWaStore((s) => s.pokePresence)
  const replyToId = useWaStore((s) => s.replyToId)
  const setReplyTo = useWaStore((s) => s.setReplyTo)
  const setView = useUiStore((s) => s.setView)
  const pushToast = useToastStore((s) => s.push)

  const [draft, setDraft] = useState('')
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null)
  const [reactMsgId, setReactMsgId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showFab, setShowFab] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const stickRef = useRef(true)

  const chat = chats.find((c) => c.id === activeChatId)
  const allMessages = useMemo(() => {
    const list = chat ? (messagesByChat[chat.id] ?? []).slice().sort((a, b) => a.ts - b.ts) : []
    // Drop protocol echoes that slipped through (empty text, not deleted)
    return list.filter((m) => m.type !== 'text' || m.body || m.deleted)
  }, [chat, messagesByChat])
  const messages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allMessages
    return allMessages.filter((m) => m.body.toLowerCase().includes(q))
  }, [allMessages, query])
  const replyTo = replyToId ? allMessages.find((m) => m.id === replyToId) : undefined

  const scrollToBottom = (smooth: boolean) => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' as ScrollBehavior })
    stickRef.current = true
    setShowFab(false)
  }

  // Open at the bottom (latest messages), not the top
  useEffect(() => {
    stickRef.current = true
    setShowFab(false)
    setQuery('')
    const t = setTimeout(() => scrollToBottom(false), 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])

  // Follow new messages while stuck to the bottom; otherwise show the FAB
  const msgCount = messages.length
  const lastTs = messages.length > 0 ? messages[messages.length - 1]!.ts : 0
  useEffect(() => {
    if (stickRef.current) {
      scrollToBottom(msgCount < 60)
    } else {
      setShowFab(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgCount, lastTs])

  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = nearBottom
    setShowFab(!nearBottom)
  }

  if (!chat) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-[var(--color-text-secondary)]">
        Select a chat to start messaging.
      </div>
    )
  }

  const typing = presence && (presence.state === 'composing' || presence.state === 'recording')
  const menuMsg = menuMsgId ? allMessages.find((m) => m.id === menuMsgId) : undefined

  const send = () => {
    setShowEmoji(false)
    if (editingId) {
      const body = editDraft.trim()
      if (body) editMessage(chat.id, editingId, body)
      setEditingId(null)
      setEditDraft('')
      return
    }
    const body = draft.trim()
    if (!body) return
    sendText(chat.id, body)
    setDraft('')
  }

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current
    const apply = editingId ? setEditDraft : setDraft
    const current = editingId ? editDraft : draft
    if (!el) {
      apply(current + emoji)
      return
    }
    const start = el.selectionStart ?? current.length
    const end = el.selectionEnd ?? current.length
    const next = current.slice(0, start) + emoji + current.slice(end)
    apply(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  const copy = (m: Msg) => {
    if (!m.body) return
    void navigator.clipboard?.writeText(m.body).then(
      () => pushToast('Copied'),
      () => pushToast('Copy failed', 'error'),
    )
    setMenuMsgId(null)
  }

  let lastDay = ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
        <button type="button" onClick={() => setView('home')} className="rounded-full px-1.5 py-0.5 text-sm hover:bg-white/10" aria-label="Back to chats">
          ←
        </button>
        <Avatar name={chat.name} pic={chat.pic} chatId={chat.id} isGroup={chat.isGroup} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{chat.name}</span>
          <span className="block truncate text-[10px] text-emerald-300">
            {typing ? 'typing…' : chat.isGroup ? `${chat.unread > 0 ? `${chat.unread} unread • ` : ''}Group` : 'tap search for history'}
          </span>
        </span>
        <button type="button" onClick={() => setSearchOpen((v) => !v)} className="rounded-full px-1.5 py-0.5 text-sm hover:bg-white/10" aria-label="Search in conversation">
          🔍
        </button>
      </div>

      {searchOpen && (
        <div className="px-2 pt-1.5">
          <input
            aria-label="Search in conversation"
            data-needs-focus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="glass-chip glass-chip-input w-full rounded-full px-3 py-1 text-xs outline-none placeholder:text-[var(--color-text-secondary)]"
          />
        </div>
      )}

      <div ref={listRef} onScroll={onListScroll} className="scroll-thin relative min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--color-text-secondary)]">
            {query ? 'No messages match.' : 'No messages yet. Say hi 👋'}
          </p>
        )}
        {messages.map((m) => {
          const day = dayLabel(m.ts)
          const showDay = day !== lastDay
          lastDay = day
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-1.5 flex justify-center">
                  <span className="glass-chip rounded-full px-2.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">{day}</span>
                </div>
              )}
              <div className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`${m.fromMe ? 'glass-bubble-out' : 'glass-bubble-in'} relative max-w-[85%] px-2.5 py-1.5`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuMsgId(m.id)
                    setReactMsgId(null)
                  }}
                >
                  {chat.isGroup && !m.fromMe && m.senderName && (
                    <p className="text-[10px] font-semibold text-[var(--color-accent)]">{m.senderName}</p>
                  )}
                  {m.deleted ? (
                    <p className="text-[13px] text-[var(--color-text-secondary)] italic">🚫 This message was deleted</p>
                  ) : (
                    <MessageBody msg={m} />
                  )}
                  {m.reaction && (
                    <span className="glass-chip absolute -bottom-2.5 left-1 rounded-full px-1 text-[11px]">{m.reaction}</span>
                  )}
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-[var(--color-text-secondary)]">
                    {m.edited && <span>edited • </span>}
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.fromMe && <Ticks status={m.status} />}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuMsgId(menuMsgId === m.id ? null : m.id)
                      setReactMsgId(null)
                    }}
                    className="absolute -top-1 right-0 rounded-full px-1 text-[10px] opacity-40 hover:opacity-100"
                    aria-label="Message actions"
                  >
                    ▾
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {showFab && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Scroll to latest"
            className="glass-pill sticky bottom-2 left-1/2 z-[65] flex h-8 w-8 -translate-x-1/2 items-center justify-center text-sm"
          >
            ↓
          </button>
        )}
      </div>

      {menuMsg && (
        <MessageMenu
          msg={menuMsg}
          onClose={() => setMenuMsgId(null)}
          onReply={() => {
            setReplyTo(menuMsg.id)
            setMenuMsgId(null)
          }}
          onReact={() => setReactMsgId(menuMsg.id)}
          onCopy={() => copy(menuMsg)}
          onEdit={() => {
            setEditingId(menuMsg.id)
            setEditDraft(menuMsg.body)
            setMenuMsgId(null)
          }}
          onDelete={() => {
            deleteMessage(chat.id, menuMsg.id)
            setMenuMsgId(null)
          }}
        />
      )}

      {reactMsgId && (
        <div className="glass-menu animate-context-menu-in absolute bottom-24 left-1/2 z-[75] flex -translate-x-1/2 gap-1 p-1.5">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                react(chat.id, reactMsgId, e)
                setReactMsgId(null)
                setMenuMsgId(null)
              }}
              className="rounded-full px-1.5 py-1 text-lg hover:bg-white/10"
            >
              {e}
            </button>
          ))}
          <button type="button" onClick={() => setReactMsgId(null)} className="px-1 text-xs text-[var(--color-text-secondary)]">
            ✕
          </button>
        </div>
      )}

      {(replyTo || editingId) && (
        <div className="mx-2 mb-1 flex items-center gap-2 rounded-xl bg-white/10 px-2 py-1 text-[11px]">
          <span className="h-6 w-0.5 shrink-0 rounded bg-[var(--color-accent)]" />
          <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
            {editingId ? 'Editing message…' : `Replying to: ${replyTo?.body || '[media]'}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null)
              setEditingId(null)
            }}
            className="px-1"
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>
      )}

      <div className="relative p-2">
        {showEmoji && (
          <>
            <button type="button" aria-label="Close emoji picker" onClick={() => setShowEmoji(false)} className="fixed inset-0 z-[76] cursor-default" />
            <EmojiPicker onPick={insertEmoji} />
          </>
        )}
        <div className="glass-chip glass-chip-input flex items-center gap-0.5 rounded-full px-1.5 py-1.5">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className={`rounded-full px-1.5 hover:bg-white/10 ${showEmoji ? 'bg-white/10' : ''}`}
            title="Emoji"
            aria-label="Open emoji picker"
            aria-expanded={showEmoji}
          >
            😊
          </button>
          <button type="button" onClick={() => pickAndSend(chat.id)} className="rounded-full px-1.5 hover:bg-white/10" title="Attach file" aria-label="Attach file">
            📎
          </button>
          <input
            ref={inputRef}
            aria-label="Message input"
            data-needs-focus
            value={editingId ? editDraft : draft}
            onChange={(e) => {
              if (editingId) setEditDraft(e.target.value)
              else {
                setDraft(e.target.value)
                pokePresence(chat.id, 'composing')
              }
            }}
            onBlur={() => pokePresence(chat.id, 'paused')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
              if (e.key === 'Escape') {
                if (showEmoji) setShowEmoji(false)
                else if (editingId) setEditingId(null)
              }
            }}
            placeholder={editingId ? 'Edit message…' : 'Type a message...'}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-secondary)]"
          />
          <button
            type="button"
            onClick={send}
            className="rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-xs font-semibold text-black"
            aria-label={editingId ? 'Save edit' : 'Send message'}
          >
            {editingId ? '✓' : '➤'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBody({ msg }: { msg: Msg }) {
  const getMedia = useWaStore((s) => s.getMedia)
  const mediaByMsg = useWaStore((s) => s.mediaByMsg)
  const [loading, setLoading] = useState(false)
  const cached = mediaByMsg[msg.id]

  if (msg.type === 'text' || (!msg.hasMedia && msg.body)) {
    return <p className="text-[13px] leading-snug break-words whitespace-pre-wrap">{msg.body || `[${msg.type}]`}</p>
  }

  const load = () => {
    if (cached || loading) return
    setLoading(true)
    void getMedia(msg.id).finally(() => setLoading(false))
  }

  if (msg.type === 'image' || msg.type === 'sticker') {
    return (
      <div>
        {msg.thumb && !cached && <img src={msg.thumb} alt="" className="max-h-32 rounded-lg" />}
        {cached && <img src={cached} alt="" className="max-h-56 rounded-lg" draggable={false} />}
        {!cached && (
          <button type="button" onClick={load} className="glass-chip mt-1 rounded-full px-2 py-0.5 text-[11px]">
            {loading ? 'Loading…' : msg.thumb ? 'View full' : 'Load image'}
          </button>
        )}
        {msg.body && <p className="mt-1 text-[13px] leading-snug break-words whitespace-pre-wrap">{msg.body}</p>}
      </div>
    )
  }

  if (msg.type === 'voice') {
    return (
      <div className="min-w-[160px]">
        {cached ? (
          <audio src={cached} controls className="h-8 w-full" preload="metadata" />
        ) : (
          <button type="button" onClick={load} className="glass-chip rounded-full px-2 py-1 text-[11px]">
            {loading ? 'Loading…' : '🎤 Play voice note'}
          </button>
        )}
      </div>
    )
  }

  if (msg.type === 'video') {
    return (
      <div>
        {msg.thumb && !cached && <img src={msg.thumb} alt="" className="max-h-32 rounded-lg" />}
        {cached && <video src={cached} controls className="max-h-56 rounded-lg" preload="metadata" />}
        {!cached && (
          <button type="button" onClick={load} className="glass-chip mt-1 rounded-full px-2 py-0.5 text-[11px]">
            {loading ? 'Loading…' : '▶ Load video'}
          </button>
        )}
        {msg.body && <p className="mt-1 text-[13px]">{msg.body}</p>}
      </div>
    )
  }

  // doc / location / contact / fallback
  const icon = msg.type === 'doc' ? '📄' : msg.type === 'location' ? '📍' : msg.type === 'contact' ? '👤' : '📎'
  return (
    <div>
      <p className="text-[13px]">
        {icon} {msg.body || `${msg.type} message`}
      </p>
      {msg.type === 'doc' && !cached && (
        <button type="button" onClick={load} className="glass-chip mt-1 rounded-full px-2 py-0.5 text-[11px]">
          {loading ? 'Loading…' : 'Download'}
        </button>
      )}
      {cached && msg.type === 'doc' && (
        <a href={cached} download={`chattt-${msg.id}`} className="text-[11px] text-[var(--color-accent)] underline">
          Save file
        </a>
      )}
    </div>
  )
}

function MessageMenu({
  msg,
  onClose,
  onReply,
  onReact,
  onCopy,
  onEdit,
  onDelete,
}: {
  msg: Msg
  onClose: () => void
  onReply: () => void
  onReact: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const items: { label: string; fn: () => void; danger?: boolean }[] = [
    { label: '↩ Reply', fn: onReply },
    { label: '😀 React', fn: onReact },
    { label: '⧉ Copy', fn: onCopy },
  ]
  if (msg.fromMe && msg.type === 'text') items.push({ label: '✎ Edit', fn: onEdit })
  if (msg.fromMe) items.push({ label: '🗑 Delete', fn: onDelete, danger: true })

  return (
    <>
      <button type="button" aria-label="Close menu" onClick={onClose} className="fixed inset-0 z-[72] cursor-default" />
      <div className="glass-menu animate-context-menu-in absolute right-3 bottom-24 z-[75] w-36 overflow-hidden p-1" role="menu">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={it.fn}
            className={`block w-full rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-white/10 ${it.danger ? 'text-red-300' : ''}`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}
