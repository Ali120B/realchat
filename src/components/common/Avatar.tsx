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
}: {
  name: string
  pic?: string | null
  chatId?: string
  isGroup?: boolean
  size?: number
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
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: showImg ? 'rgba(255,255,255,0.08)' : `hsla(${hueOf(name || '?')}, 70%, 45%, 0.35)`,
        border: '1px solid rgba(255,255,255,0.12)',
      }}
      aria-hidden="true"
    >
      {showImg ? (
        <img src={pic} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} onError={handleError} draggable={false} />
      ) : (
        <span className="text-white/90">{isGroup ? '👥' : initialOf(name)}</span>
      )}
    </span>
  )
}
