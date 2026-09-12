import { useState } from 'react'
import { useWaStore } from '@/store/waStore'
import type { ConnState } from '@/types'

function formatPairing(code: string) {
  const clean = code.replace(/\D/g, '')
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : code
}

export function QrLogin() {
  const connection = useWaStore((s) => s.connection)
  const qrDataUrl = useWaStore((s) => s.qrDataUrl)
  const live = useWaStore((s) => s.live)
  const previewLinked = useWaStore((s) => s.previewLinked)
  const pairingCode = useWaStore((s) => s.pairingCode)
  const pairingError = useWaStore((s) => s.pairingError)
  const requestPairing = useWaStore((s) => s.requestPairing)
  const [tab, setTab] = useState<'qr' | 'code'>('qr')
  const [phone, setPhone] = useState('')

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-3 text-center">
      <StatusLine connection={connection} />

      <div className="glass-chip mt-2 flex w-full rounded-full p-1">
        <TabBtn active={tab === 'qr'} label="Scan QR" onClick={() => setTab('qr')} />
        {live && <TabBtn active={tab === 'code'} label="Pairing code" onClick={() => setTab('code')} />}
      </div>

      {tab === 'qr' ? (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="WhatsApp link QR code"
              className="h-36 w-36 rounded-2xl bg-white p-1.5"
              draggable={false}
            />
          ) : (
            <div className="glass-chip flex h-36 w-36 items-center justify-center p-3 text-xs text-[var(--color-text-secondary)]">
              {connection === 'qr'
                ? 'Generating QR…'
                : connection === 'connecting'
                  ? 'Connecting…'
                  : connection === 'offline'
                    ? 'Offline — reconnecting…'
                    : 'Preparing…'}
            </div>
          )}
          <ol className="space-y-0 text-left text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
            <li>1. Open WhatsApp → Settings → Linked devices</li>
            <li>2. Tap Link a device and scan this screen</li>
          </ol>
        </div>
      ) : (
        <div className="mt-3 flex w-full flex-col items-center gap-2">
          <input
            aria-label="Phone number"
            data-needs-focus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15551234567"
            inputMode="tel"
            className="glass-chip glass-chip-input w-full rounded-full px-3 py-1.5 text-center text-sm outline-none placeholder:text-[var(--color-text-secondary)]"
          />
          <button
            type="button"
            onClick={() => requestPairing(phone)}
            className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-black"
          >
            Get code
          </button>
          {pairingCode && (
            <div className="glass-chip px-4 py-2">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Enter on your phone</p>
              <p className="text-xl font-bold tracking-widest">{formatPairing(pairingCode)}</p>
            </div>
          )}
          {pairingError && <p className="text-[11px] text-red-400">{pairingError}</p>}
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            WhatsApp → Linked devices → Link with phone number
          </p>
        </div>
      )}

      {!live && (
        <button
          type="button"
          onClick={previewLinked}
          className="glass-chip mt-3 rounded-full px-3 py-1 text-[11px] text-[var(--color-text-secondary)]"
        >
          Preview linked UI (browser demo)
        </button>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
        Unofficial client — personal use only. Linking a number carries ban risk; never use your primary number.
      </p>
    </div>
  )
}

function StatusLine({ connection }: { connection: ConnState }) {
  const map: Record<string, string> = {
    connecting: '🟡 Connecting…',
    qr: '🟡 Waiting for link…',
    syncing: '🔵 Syncing chats…',
    ready: '🟢 Linked',
    offline: '🔴 Offline — retrying…',
    'logged-out': '🔴 Logged out — link again',
  }
  return <p className="text-xs font-medium">{map[connection] || connection}</p>
}

function TabBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full py-1 text-xs ${active ? 'bg-[var(--color-accent)] font-semibold text-black' : 'text-[var(--color-text-secondary)]'}`}
    >
      {label}
    </button>
  )
}
