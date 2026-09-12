import type { ReactNode, CSSProperties } from 'react'

type GlassVariant = 'window' | 'pill' | 'chip' | 'bubble-out' | 'bubble-in'

interface GlassPanelProps {
  variant?: GlassVariant
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

const variantClass: Record<GlassVariant, string> = {
  window: 'glass-window',
  pill: 'glass-pill',
  chip: 'glass-chip',
  'bubble-out': 'glass-bubble-out',
  'bubble-in': 'glass-bubble-in',
}

export function GlassPanel({ variant = 'window', className = '', style, children }: GlassPanelProps) {
  return (
    <div className={`${variantClass[variant]} ${className}`} style={style}>
      {children}
    </div>
  )
}
