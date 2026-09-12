import type { ReactNode } from 'react'
import { GlassPanel } from '@/components/glass/GlassPanel'

// Fills the flex column below the bubble row — never absolutely positioned,
// so resizes can't detach it from the bubble.
export function ChatWindow({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 animate-scale-in" role="dialog" aria-label="Chat window" aria-modal="true">
      <GlassPanel variant="window" className="glass-text relative flex h-full flex-col overflow-hidden">
        {children}
      </GlassPanel>
    </div>
  )
}
