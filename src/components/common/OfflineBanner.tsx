import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
  return { isOnline }
}

export function OfflineBanner() {
  return (
    <div className="bg-amber-500/90 px-2 py-1 text-center text-[11px] font-medium text-black">
      No internet — messages will sync when you reconnect.
    </div>
  )
}
