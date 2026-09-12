import { useRef, useState } from 'react'
import { useWaStore } from '@/store/waStore'

function initialOf(name: string) {
  const clean = name.replace(/^[^a-zA-Z0-9+]+/, '').trim()
  if (!clean) return '?'
  if (clean.startsWith('+')) return '#'
  return clean[0]!.toUpperCase()
}

function hueOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function Avatar({
  name,
  pic,
  chatId,
  isGroup = false,
  size = 36,
  online = false,
}: {
  name: string
  pic?: string | null
  chatId?: string
  isGroup?: boolean
  size?: number
  online?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const retried = useRef(false)
  const showImg = pic && !failed

  const handleError = () => {
    // Cached preview URLs expire (403 at render time) — ask main for a fresh one once
    if (!retried.current && chatId) {
      retried.current = true
      useWaStore.getState().refreshPic(chatId)
    }
    setFailed(true)
  }

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span
        className="flex items-center justify-center overflow-hidden rounded-full font-semibold"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.38,
          background: showImg ? 'rgba(255,255,255,0.08)' : `hsla(${hueOf(name || '?')}, 70%, 45%, 0.35)`,
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        {showImg ? (
          <img src={pic} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} onError={handleError} draggable={false} />
        ) : (
          <span className="text-white/90">{isGroup ? '👥' : initialOf(name)}</span>
        )}
      </span>
      {online && (
        <span
          className="absolute right-0 bottom-0 rounded-full bg-emerald-400"
          style={{
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            border: '2px solid rgba(20,22,24,0.9)',
          }}
        />
      )}
    </span>
  )
}
