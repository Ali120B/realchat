import { useEffect } from 'react'
import { windowSizeFor, type OverlaySize } from '@/types'

/** Resize Electron window to fit the attached bubble row + chat panel. */
export function useElectronResize(isWindowOpen: boolean, size: OverlaySize) {
  useEffect(() => {
    if (!window.electronAPI?.resizeOverlay) return
    const w = windowSizeFor(size, isWindowOpen)
    window.electronAPI.resizeOverlay(w.width, w.height)
  }, [isWindowOpen, size])
}
