import { useToastStore } from '@/store/toastStore'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none absolute top-[52px] left-0 z-[80] flex w-full flex-col items-center gap-1.5 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`glass-menu animate-slide-up pointer-events-auto max-w-full rounded-2xl px-3 py-1.5 text-xs ${
            t.kind === 'error' ? 'text-red-300' : ''
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
