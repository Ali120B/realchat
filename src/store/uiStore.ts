import { create } from 'zustand'
import type { AppView, OverlaySize, Position, SnapSide } from '@/types'
import { OVERLAY_DIMENSIONS, windowSizeFor } from '@/types'

const BUBBLE_SIZE = 48
const EDGE_PADDING = 16

interface UiState {
  isWindowOpen: boolean
  activeView: AppView
  bubblePos: Position
  snapSide: SnapSide
  isDragging: boolean
  overlaySize: OverlaySize
  toggleWindow: () => void
  openWindow: () => void
  closeWindow: () => void
  setView: (view: AppView) => void
  setBubblePos: (pos: Position) => void
  setOverlaySize: (size: OverlaySize) => void
  setDragging: (dragging: boolean) => void
  initBubblePosition: () => void
}

export const BUBBLE_DIMENSIONS = { size: BUBBLE_SIZE, padding: EDGE_PADDING }

function applyOverlaySize(size: OverlaySize, isOpen: boolean) {
  const w = windowSizeFor(size, isOpen)
  window.electronAPI?.resizeOverlay?.(w.width, w.height)
}

export const useUiStore = create<UiState>((set, get) => ({
  isWindowOpen: false,
  activeView: 'home',
  bubblePos: { x: window.innerWidth - BUBBLE_SIZE - EDGE_PADDING, y: 100 },
  snapSide: 'right',
  isDragging: false,
  overlaySize: 'S',

  toggleWindow: () => {
    const next = !get().isWindowOpen
    set({ isWindowOpen: next })
    applyOverlaySize(get().overlaySize, next)
  },

  openWindow: () => {
    set({ isWindowOpen: true })
    applyOverlaySize(get().overlaySize, true)
  },

  closeWindow: () => {
    set({ isWindowOpen: false })
    applyOverlaySize(get().overlaySize, false)
  },

  setView: (view) => set({ activeView: view }),

  setBubblePos: (pos) => set({ bubblePos: pos }),

  setOverlaySize: (size) => {
    set({ overlaySize: size })
    try {
      localStorage.setItem('chattt-overlay-size', size)
    } catch {
      // ignore
    }
    applyOverlaySize(size, get().isWindowOpen)
  },

  setDragging: (dragging) => set({ isDragging: dragging }),
  initBubblePosition: () => {
    const apply = (workW: number) => {
      // Anchor = top-left of the OS window in both modes, so read the stored
      // size first and default to a spot where the OPEN panel fits on-screen.
      let size: OverlaySize = 'S'
      try {
        const s = localStorage.getItem('chattt-overlay-size')
        if (s === 'S' || s === 'M' || s === 'L') size = s
      } catch {
        // keep default
      }
      const panelW = OVERLAY_DIMENSIONS[size].width
      const stored = (() => {
        try {
          return localStorage.getItem('chattt-bubble-pos')
        } catch {
          return null
        }
      })()
      let pos: Position = { x: Math.max(0, workW - panelW - EDGE_PADDING), y: 100 }
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Position
          // Clamp stale positions into the current work area
          pos = {
            x: Math.max(0, Math.min(parsed.x, workW - BUBBLE_SIZE - EDGE_PADDING)),
            y: Math.max(0, parsed.y),
          }
        } catch {
          // keep default
        }
      }
      set({ bubblePos: pos, snapSide: pos.x < workW / 2 ? 'left' : 'right', overlaySize: size })
      window.electronAPI?.setPosition?.(pos.x, pos.y)
    }
    // Default from the OS work area (screen coords), NOT the 200px overlay window.
    const p = window.electronAPI?.getWorkArea?.()
    if (p && typeof p.then === 'function') {
      p.then((wa) => apply(wa?.width || window.screen.availWidth || 1280)).catch(() =>
        apply(window.screen.availWidth || 1280),
      )
    } else {
      apply(window.screen.availWidth || 1280)
    }
  },
}))
