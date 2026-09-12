import { useCallback, useRef } from 'react'
import type { Position } from '@/types'
import { BUBBLE_DIMENSIONS } from '@/store/uiStore'

const CLICK_THRESHOLD = 5

interface UsePointerDragOptions {
  position: Position
  onMove: (pos: Position) => void
  onDragEnd: (pos: Position, wasClick: boolean) => void
  onDragStart?: () => void
  disabled?: boolean
  shouldStart?: (e: React.PointerEvent) => boolean
}

export function usePointerDrag({ position, onMove, onDragEnd, onDragStart, disabled = false, shouldStart }: UsePointerDragOptions) {
  const dragState = useRef({ isDragging: false, startX: 0, startY: 0, originX: 0, originY: 0, pointerId: -1 })

  const clamp = useCallback((x: number, y: number): Position => {
    const maxX = window.innerWidth - BUBBLE_DIMENSIONS.size
    const maxY = window.innerHeight - BUBBLE_DIMENSIONS.size
    return { x: Math.max(0, Math.min(x, maxX)), y: Math.max(0, Math.min(y, maxY)) }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || (shouldStart && !shouldStart(e))) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragState.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
        pointerId: e.pointerId,
      }
      onDragStart?.()
    },
    [disabled, position, onDragStart, shouldStart],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current.isDragging) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      onMove(clamp(dragState.current.originX + dx, dragState.current.originY + dy))
    },
    [clamp, onMove],
  )

  const finishDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current.isDragging) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      const wasClick = Math.hypot(dx, dy) < CLICK_THRESHOLD
      dragState.current.isDragging = false
      onDragEnd(clamp(dragState.current.originX + dx, dragState.current.originY + dy), wasClick)
    },
    [clamp, onDragEnd],
  )

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: finishDrag,
    handlePointerCancel: finishDrag,
  }
}
