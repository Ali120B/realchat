import { useState } from 'react'
import { useWaStore } from '@/store/waStore'
import { useUiStore } from '@/store/uiStore'
import { useToastStore } from '@/store/toastStore'
import { Avatar } from '@/components/common/Avatar'

// New chat: type a number (or pick a known contact) → verify → open chat.
export function NewChatView() {
  const live = useWaStore((s) => s.live)
  const chats = useWaStore((s) => s.chats)
  const contactResult = useWaStore((s) => s.contactResult)
  const contactError = useWaStore((s) => s.contactError)
  const contactLoading = useWaStore((s) => s.contactLoading)
  const resolveContact = useWaStore((s) => s.resolveContact)
  const clearContact = useWaStore((s) => s.clearContact)
  const startChat = useWaStore((s) => s.startChat)
  const setActiveChat = useWaStore((s) => s.setActiveChat)
  const setView = useUiStore((s) => s.setView)
  const pushToast = useToastStore((s) => s.push)
  const [input, setInput] = useState('')

  const openChat = (jid: string) => {
    startChat(jid)
    setView('chat')
  }

  const known = chats.filter((c) => !c.isGroup).slice(0, 30)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
        <button type="button" onClick={() => setView('home')} className="rounded-full px-1.5 py-0.5 text-sm hover:bg-white/10" aria-label="Back to chats">
          ←
        </button>
        <span className="text-sm font-medium">New chat</span>
      </div>

      <div className="flex gap-1.5 p-2">
        <input
          aria-label="Phone number"
          data-needs-focus
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            clearContact()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') resolveContact(input)
          }}
          placeholder="+15551234567"
          inputMode="tel"
          className="glass-chip glass-chip-input min-w-0 flex-1 rounded-full px-3 py-1.5 text-sm outline-none placeholder:text-[var(--color-text-secondary)]"
        />
        <button
          type="button"
          onClick={() => (live ? resolveContact(input) : pushToast('Connect WhatsApp first', 'error'))}
          disabled={contactLoading}
          className="shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
        >
          {contactLoading ? '…' : 'Check'}
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {contactResult?.exists && contactResult.jid && (
          <button
            type="button"
            onClick={() => openChat(contactResult.jid!)}
            className="glass-chip mb-2 flex w-full items-center gap-2.5 rounded-2xl p-2 text-left"
          >
            <Avatar name={contactResult.name || input} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{contactResult.name || 'WhatsApp contact'}</span>
              <span className="block truncate text-xs text-[var(--color-text-secondary)]">{input} • tap to chat →</span>
            </span>
          </button>
        )}
        {contactError && <p className="px-3 py-2 text-center text-xs text-red-300">{contactError}</p>}

        <p className="px-2 pt-1 pb-1 text-[10px] font-semibold text-[var(--color-text-secondary)]">RECENT CONTACTS</p>
        {known.length === 0 && <p className="px-2 text-xs text-[var(--color-text-secondary)]">No contacts yet.</p>}
        {known.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setActiveChat(c.id)
              setView('chat')
            }}
            className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left hover:bg-white/10"
          >
            <Avatar name={c.name} pic={c.pic} chatId={c.id} size={32} />
            <span className="truncate text-sm">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
