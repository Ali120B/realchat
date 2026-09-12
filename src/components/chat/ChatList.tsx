import { useWaStore } from '@/store/waStore'
import { useUiStore } from '@/store/uiStore'
import { Avatar } from '@/components/common/Avatar'

function formatTime(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatList() {
  const chats = useWaStore((s) => s.chats)
  const archivedCount = useWaStore((s) => s.archivedCount)
  const showArchived = useWaStore((s) => s.showArchived)
  const toggleArchived = useWaStore((s) => s.toggleArchived)
  const search = useWaStore((s) => s.search)
  const setSearch = useWaStore((s) => s.setSearch)
  const setActiveChat = useWaStore((s) => s.setActiveChat)
  const setView = useUiStore((s) => s.setView)

  const q = search.trim().toLowerCase()
  const visible = [...chats]
    .filter((c) => (q ? c.name.toLowerCase().includes(q) || c.lastMsg.toLowerCase().includes(q) : true))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.ts - a.ts)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <input
          aria-label="Search chats"
          data-needs-focus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search"
          className="glass-chip glass-chip-input min-w-0 flex-1 rounded-full px-3 py-1.5 text-sm outline-none placeholder:text-[var(--color-text-secondary)]"
        />
        <button
          type="button"
          onClick={() => setView('newChat')}
          title="New chat"
          aria-label="New chat"
          className="glass-chip flex h-8 w-8 shrink-0 items-center justify-center text-base hover:bg-white/15"
        >
          ✎
        </button>
      </div>
      <div className="scroll-thin stagger-children min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {visible.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            {q ? 'No chats match your search.' : 'No chats yet. Tap ✎ to start one.'}
          </p>
        )}
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setActiveChat(c.id)
              setView('chat')
            }}
            className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/10"
          >
            <Avatar name={c.name} pic={c.pic} chatId={c.id} isGroup={c.isGroup} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {c.pinned ? '📌 ' : ''}
                  {c.name}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--color-text-secondary)]">{formatTime(c.ts)}</span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-[var(--color-text-secondary)]">{c.lastMsg}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {c.muted && (
                    <span className="text-[10px]" title="Muted">
                      🔇
                    </span>
                  )}
                  {c.unread > 0 && (
                    <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-semibold text-black">
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </span>
          </button>
        ))}
        {!q && (archivedCount > 0 || showArchived) && (
          <button
            type="button"
            onClick={toggleArchived}
            className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs text-[var(--color-text-secondary)] hover:bg-white/10"
          >
            📦 {showArchived ? 'Hide archived' : `Archived (${archivedCount})`}
          </button>
        )}
      </div>
    </div>
  )
}
