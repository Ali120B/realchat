import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'error' | 'info'
}

let nextId = 1

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  push: (text, kind = 'info') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
