import { useUiStore } from '@/store/uiStore'
import { useOverlayDrag } from '@/hooks/useOverlayDrag'
import { useThemeStore } from '@/store/themeStore'
import { useSettingsStore } from '@/store/settingsStore'

interface FloatingBubbleProps {
  unreadCount: number
}

export function FloatingBubble({ unreadCount }: FloatingBubbleProps) {
  const isWindowOpen = useUiStore((s) => s.isWindowOpen)
  const toggleWindow = useUiStore((s) => s.toggleWindow)
  const accentHex = useThemeStore((s) => s.getAccentHex)()
  const showUnread = useSettingsStore((s) => s.showUnread)

  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useOverlayDrag({
    onDragEnd: (_pos, wasClick) => {
      if (wasClick) toggleWindow()
    },
  })

  return (
    <button
      type="button"
      className={`glass-pill relative z-[70] flex h-12 w-12 touch-none items-center justify-center select-none ${
        unreadCount > 0 && !isWindowOpen ? 'animate-pulse-glow' : ''
      } ${isWindowOpen ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
      style={{ cursor: 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      aria-label={isWindowOpen ? 'Close chat' : 'Open chat'}
      aria-expanded={isWindowOpen}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={accentHex}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {showUnread && unreadCount > 0 && !isWindowOpen && (
        <span
          className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E53E3E] px-1 text-[10px] font-semibold text-white"
          aria-label={`${unreadCount} unread messages`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
