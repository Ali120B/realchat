import { useState } from 'react'
import { THEME_OPTIONS, useThemeStore } from '@/store/themeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { useWaStore } from '@/store/waStore'
import type { OverlaySize } from '@/types'

export function SettingsPanel() {
  const activeTheme = useThemeStore((s) => s.activeTheme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const settings = useSettingsStore()
  const overlaySize = useUiStore((s) => s.overlaySize)
  const setOverlaySize = useUiStore((s) => s.setOverlaySize)
  const connection = useWaStore((s) => s.connection)
  const live = useWaStore((s) => s.live)
  const logout = useWaStore((s) => s.logout)
  const showArchived = useWaStore((s) => s.showArchived)
  const archivedCount = useWaStore((s) => s.archivedCount)
  const toggleArchived = useWaStore((s) => s.toggleArchived)
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
      <section className="glass-chip flex items-center justify-between rounded-2xl px-3 py-2 text-xs">
        <span>
          Status: <strong>{connection}</strong>
          {!live && ' (browser demo)'}
        </span>
        <span className={`h-2 w-2 rounded-full ${connection === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">Accent</h3>
        <div className="flex flex-wrap gap-1.5">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`h-7 w-7 rounded-full ${activeTheme === t.id ? 'ring-2 ring-white/70' : ''}`}
              style={{ background: t.hex }}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">Overlay size</h3>
        <div className="glass-chip flex rounded-full p-1">
          {(['S', 'M', 'L'] as OverlaySize[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setOverlaySize(s)}
              className={`flex-1 rounded-full py-1 text-xs ${overlaySize === s ? 'bg-[var(--color-accent)] font-semibold text-black' : ''}`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <Toggle label="Always on top" value={settings.alwaysOnTop} onChange={(v) => settings.set({ alwaysOnTop: v })} />
        <Toggle label="Launch on startup" value={settings.launchOnStartup} onChange={(v) => settings.set({ launchOnStartup: v })} />
        <Toggle label="Notifications" value={settings.notifications} onChange={(v) => settings.set({ notifications: v })} />
        <Toggle label="Sound" value={settings.sound} onChange={(v) => settings.set({ sound: v })} />
        <Toggle label="Show unread badge" value={settings.showUnread} onChange={(v) => settings.set({ showUnread: v })} />
        <Toggle
          label={`Show archived chats${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
          value={showArchived}
          onChange={() => toggleArchived()}
        />
        <Toggle label="Animations" value={settings.animations} onChange={(v) => settings.set({ animations: v })} />
        <label className="flex items-center justify-between gap-2 text-xs">
          Font size
          <input type="range" min={12} max={17} value={settings.fontSize} onChange={(e) => settings.set({ fontSize: Number(e.target.value) })} />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          Transparency
          <input type="range" min={0.5} max={1} step={0.05} value={settings.transparency} onChange={(e) => settings.set({ transparency: Number(e.target.value) })} />
        </label>
      </section>

      <section>
        {connection === 'ready' || !live ? (
          confirmLogout ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => { logout(); setConfirmLogout(false) }} className="flex-1 rounded-full bg-red-500/80 py-1.5 text-xs font-semibold text-white">
                Unlink device
              </button>
              <button type="button" onClick={() => setConfirmLogout(false)} className="glass-chip flex-1 rounded-full py-1.5 text-xs">
                Keep
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmLogout(true)} className="glass-chip w-full rounded-full py-1.5 text-xs text-red-300">
              Unlink WhatsApp device…
            </button>
          )
        ) : null}
        <p className="mt-1 text-center text-[10px] text-[var(--color-text-secondary)]">
          Global shortcut: Alt+/ or Alt+Shift+Space
        </p>
      </section>

      <p className="text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
        chattt is an unofficial WhatsApp client. Use a spare number — bans are possible. Windows + Linux AppImage only.
      </p>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between text-xs" aria-pressed={value}>
      {label}
      <span className={`glass-chip flex h-5 w-9 items-center rounded-full p-0.5 ${value ? 'justify-end' : 'justify-start'}`}>
        <span className={`h-4 w-4 rounded-full ${value ? 'bg-[var(--color-accent)]' : 'bg-white/30'}`} />
      </span>
    </button>
  )
}
