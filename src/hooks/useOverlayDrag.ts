import { useCallback } from 'react'
import { usePointerDrag } from '@/hooks/usePointerDrag'
import { useUiStore } from '@/store/uiStore'

interface UseOverlayDragOptions {
  shouldStart?: (e: React.PointerEvent) => boolean
  onDragEnd?: (pos: { x: number; y: number }, wasClick: boolean) => void
}

/** Drag the Electron window by moving it via IPC. */
export function useOverlayDrag(options: UseOverlayDragOptions = {}) {
  const { shouldStart, onDragEnd: onDragEndExtra } = options
  const bubblePos = useUiStore((s) => s.bubblePos)
  const setBubblePos = useUiStore((s) => s.setBubblePos)
  const setDragging = useUiStore((s) => s.setDragging)

  const onMove = useCallback(
    (pos: { x: number; y: number }) => {
      setBubblePos(pos)
      window.electronAPI?.setPosition?.(pos.x, pos.y)
    },
    [setBubblePos],
  )

  const onDragEnd = useCallback(
    (pos: { x: number; y: number }, wasClick: boolean) => {
      setDragging(false)
      setBubblePos(pos)
      window.electronAPI?.setPosition?.(pos.x, pos.y)
      window.electronAPI?.keepOnTop?.()
      try {
        localStorage.setItem('chattt-bubble-pos', JSON.stringify(pos))
      } catch {
        // ignore
      }
      onDragEndExtra?.(pos, wasClick)
    },
    [onDragEndExtra, setDragging, setBubblePos],
  )

  return usePointerDrag({
    position: bubblePos,
    onMove,
    onDragEnd,
    onDragStart: () => setDragging(true),
    shouldStart,
  })
}

/** Drag filter for header strips: ignore clicks on controls, allow empty areas. */
export function canDragFromHeaderTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('button, input, textarea, a, [role="menu"], img')) return false
  return true
}
