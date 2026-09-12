const CATEGORIES: { name: string; emojis: string[] }[] = [
  { name: 'Smileys', emojis: ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😐', '🙄', '😴', '😷', '🤯', '🥳', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '👋', '✌️', '🤝', '💯', '🔥'] },
  { name: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💖', '✨', '🎉', '🎊', '⭐', '🌟'] },
  { name: 'Gestures', emojis: ['👌', '✊', '🤞', '🫶', '👀', '🙌', '🤷', '💁', '🙋', '🤦', '💆', '🚶', '🏃', '💃', '🕺'] },
  { name: 'Food', emojis: ['🍎', '🍕', '🍔', '🍩', '🍦', '🍫', '☕', '🍺', '🍷', '🎂', '🍿', '🌮'] },
  { name: 'Nature', emojis: ['🐶', '🐱', '🦁', '🐼', '🐸', '🐵', '🌹', '🌸', '🌴', '☀️', '🌙', '⚡', '❄️', '🌈'] },
  { name: 'Objects', emojis: ['📱', '💻', '📷', '🎧', '🎮', '⚽', '🏀', '🚗', '✈️', '🏠', '💡', '🔑', '🎁', '💰', '📌', '📎'] },
  { name: 'Symbols', emojis: ['✅', '❌', '⚠️', '❓', '❗', '💤', '💢', '🆗', '🔴', '🟢', '🔵', '⬆️', '⬇️', '➡️', '©️', '®️'] },
]

const RECENT_KEY = 'chattt-recent-emoji'

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((e) => typeof e === 'string').slice(0, 12) : []
  } catch {
    return []
  }
}

function pushRecent(emoji: string) {
  try {
    const next = [emoji, ...getRecent().filter((e) => e !== emoji)].slice(0, 12)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const recent = getRecent()

  const pick = (emoji: string) => {
    pushRecent(emoji)
    onPick(emoji)
  }

  return (
    <div className="glass-menu absolute right-2 bottom-full left-2 z-[78] mb-2 max-h-56 overflow-y-auto scroll-thin p-2" role="dialog" aria-label="Emoji picker">
      {recent.length > 0 && (
        <div className="mb-1.5">
          <p className="px-1 pb-1 text-[10px] font-semibold text-[var(--color-text-secondary)]">RECENT</p>
          <div className="grid grid-cols-8 gap-0.5">
            {recent.map((e) => (
              <EmojiButton key={`r-${e}`} emoji={e} onPick={pick} />
            ))}
          </div>
        </div>
      )}
      {CATEGORIES.map((cat) => (
        <div key={cat.name} className="mb-1.5">
          <p className="px-1 pb-1 text-[10px] font-semibold text-[var(--color-text-secondary)]">{cat.name.toUpperCase()}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {cat.emojis.map((e) => (
              <EmojiButton key={`${cat.name}-${e}`} emoji={e} onPick={pick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmojiButton({ emoji, onPick }: { emoji: string; onPick: (e: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(emoji)}
      className="rounded-lg py-1 text-lg leading-none hover:bg-white/10"
      aria-label={`Insert ${emoji}`}
    >
      {emoji}
    </button>
  )
}
