import { useWaStore } from '@/store/waStore'

// Shown on cold start when a WhatsApp session exists and chats are still syncing.
// Distinct from the QR login screen so returning users never see a login flash.
export function LoadingChats() {
  const chats = useWaStore((s) => s.chats)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-6 pb-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[var(--color-accent)]" />
        <p className="text-sm font-medium">Loading chats…</p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-1 overflow-hidden px-3 pb-3">
        {(chats.length > 0 ? chats.slice(0, 8) : Array.from({ length: 5 }, (_, i) => `skeleton-${i}`)).map((c) => (
          <div key={typeof c === 'string' ? c : c.id} className="flex animate-pulse items-center gap-2.5 rounded-2xl px-2 py-2">
            <span className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3 w-2/5 rounded bg-white/10" />
              <span className="block h-2.5 w-3/5 rounded bg-white/5" />
            </span>
          </div>
        ))}
        {chats.length === 0 && (
          <p className="px-2 pt-1 text-center text-[11px] text-[var(--color-text-secondary)]">
            Syncing your conversations for the first time — this can take a few seconds.
          </p>
        )}
      </div>
    </div>
  )
}
