import { useEffect } from 'react'
import { FloatingBubble } from '@/components/overlay/FloatingBubble'
import { ChatWindow } from '@/components/overlay/ChatWindow'
import { ChatList } from '@/components/chat/ChatList'
import { ChatView } from '@/components/chat/ChatView'
import { NewChatView } from '@/components/chat/NewChatView'
import { QrLogin } from '@/components/auth/QrLogin'
import { LoadingChats } from '@/components/auth/LoadingChats'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ToastContainer } from '@/components/common/ToastContainer'
import { OfflineBanner, useOnlineStatus } from '@/components/common/OfflineBanner'
import { useUiStore } from '@/store/uiStore'
import { useWaStore } from '@/store/waStore'
import { useThemeStore } from '@/store/themeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useElectronResize } from '@/hooks/useElectronResize'
import { canDragFromHeaderTarget, useOverlayDrag } from '@/hooks/useOverlayDrag'
import type { AppView } from '@/types'

export default function App() {
  const isWindowOpen = useUiStore((s) => s.isWindowOpen)
  const activeView = useUiStore((s) => s.activeView)
  const setView = useUiStore((s) => s.setView)
  const closeWindow = useUiStore((s) => s.closeWindow)
  const toggleWindow = useUiStore((s) => s.toggleWindow)
  const initBubblePosition = useUiStore((s) => s.initBubblePosition)
  const overlaySize = useUiStore((s) => s.overlaySize)
  const connection = useWaStore((s) => s.connection)
  const hasSession = useWaStore((s) => s.hasSession)
  const live = useWaStore((s) => s.live)
  const totalUnread = useWaStore((s) => s.totalUnread)()
  const connectWa = useWaStore((s) => s.connect)
  const initTheme = useThemeStore((s) => s.initTheme)
  const loadSettings = useSettingsStore((s) => s.load)
  const { isOnline } = useOnlineStatus()

  useElectronResize(isWindowOpen, overlaySize)

  useEffect(() => {
    initTheme()
    loadSettings()
    initBubblePosition()
  }, [initTheme, loadSettings, initBubblePosition])

  useEffect(() => connectWa(), [connectWa])

  // Focus management for the click-through overlay shell.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as Element)?.closest('[data-needs-focus]')) window.electronAPI?.setFocusable?.(true)
    }
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as Element)?.closest('[data-needs-focus]')) window.electronAPI?.setFocusable?.(true)
    }
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as Element | null
      if (!related?.closest('[data-needs-focus]')) window.electronAPI?.setFocusable?.(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
    }
  }, [])

  useEffect(() => {
    window.electronAPI?.keepOnTop?.()
    const t = setInterval(() => window.electronAPI?.keepOnTop?.(), 2000)
    return () => clearInterval(t)
  }, [])

  // Global hotkey (main process) toggles the overlay; in-app keys for search/close.
  useEffect(() => {
    const off = window.electronAPI?.onGlobalFocusShortcut?.(() => toggleWindow())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isWindowOpen) closeWindow()
      if (e.key === '/' && isWindowOpen && connection === 'ready' && !(e.target instanceof HTMLInputElement)) {
        const input = document.querySelector<HTMLInputElement>('input[aria-label="Search chats"]')
        if (input && document.activeElement !== input) {
          e.preventDefault()
          input.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off?.()
      window.removeEventListener('keydown', onKey)
    }
  }, [isWindowOpen, connection, toggleWindow, closeWindow])

  const linked = connection === 'ready'
  // Returning users with a saved session see a loading skeleton while syncing —
  // never the QR screen.
  const loading = !linked && live && hasSession && (connection === 'connecting' || connection === 'syncing')

  // Bubble is the closed-state UI only; the open panel has its own × and drag header.
  if (!isWindowOpen) {
    return (
      <div className="flex h-screen w-screen items-start justify-start">
        <FloatingBubble unreadCount={totalUnread} />
        <ToastContainer />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col">
      <ChatWindow>
        {!isOnline && <OfflineBanner />}
        {!linked && !loading && connection === 'offline' && isOnline && (
          <div className="bg-white/10 px-2 py-1 text-center text-[11px] text-[var(--color-text-secondary)]">
            WhatsApp reconnecting…
          </div>
        )}
        <Header activeView={activeView} setView={setView} linked={linked} />
        {loading ? (
          <LoadingChats />
        ) : !linked ? (
          <QrLogin />
        ) : activeView === 'chat' ? (
          <ChatView />
        ) : activeView === 'settings' ? (
          <SettingsPanel />
        ) : activeView === 'newChat' ? (
          <NewChatView />
        ) : (
          <ChatList />
        )}
      </ChatWindow>
      <ToastContainer />
    </div>
  )
}

function Header({ activeView, setView, linked }: { activeView: AppView; setView: (v: AppView) => void; linked: boolean }) {
  const closeWindow = useUiStore((s) => s.closeWindow)
  // Whole header strip drags the window (controls excluded) since the bubble hides when open.
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useOverlayDrag({
    shouldStart: (e) => canDragFromHeaderTarget(e.target),
  })

  return (
    <div
      className="flex touch-none items-center gap-1 border-b border-white/10 px-2.5 py-2 select-none"
      style={{ cursor: 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <span className="text-sm font-semibold">💬 Chats</span>
      <span className={`ml-1 h-2 w-2 rounded-full ${linked ? 'bg-emerald-400' : 'bg-amber-400'}`} title={linked ? 'Linked' : 'Not linked'} />
      <span className="flex-1" />
      {linked && (
        <>
          <NavBtn active={activeView === 'home'} label="Chats" onClick={() => setView('home')} />
          <NavBtn active={activeView === 'settings'} label="⚙" onClick={() => setView('settings')} />
        </>
      )}
      <button type="button" onClick={closeWindow} className="rounded-full px-2 py-0.5 text-sm hover:bg-white/10" aria-label="Hide chat">
        ×
      </button>
    </div>
  )
}

function NavBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-[var(--color-accent)] font-semibold text-black' : 'hover:bg-white/10'}`}
    >
      {label}
    </button>
  )
}
