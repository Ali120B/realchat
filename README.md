# chattt — floating WhatsApp overlay

Compact liquid-glass desktop chat widget (Electron + React + TypeScript + Baileys).
Windows (NSIS x64) + Linux (AppImage x64) only.

> ⚠️ Unofficial WhatsApp client. Automating a personal number violates WhatsApp ToS and
> can get the number banned permanently without warning. Personal use only, spare number,
> no bulk. If the number matters, do not use this app.

## Run

```bash
npm install
npm run dev       # Electron overlay (http://localhost:5173 + electron .)
npm run dev:web   # browser-only UI dev (mock WA data + "Preview linked UI" button)
npm run build     # tsc + vite + electron shell copy
npm run dist:win  # NSIS x64 (run on Windows; native WA module needs win prebuilds)
npm run dist:linux# AppImage x64 only
```

Global shortcuts: `Alt+/` (primary) or `Alt+Shift+Space` (fallback) toggles/focuses the overlay.
In-app: `/` focuses chat search, `Enter` sends, `Esc` hides. Drag the header strip to move the open panel.

Behavior notes:
- The bubble shows only when the panel is hidden (the panel has its own × and drag header).
- Returning users with a saved session see "Loading chats…" while syncing, never a login flash.
- Chat names prefer your phone-saved names (address-book sync), then group subjects, then profile names.
- Archived chats hide behind an 📦 row + a Settings toggle.
- Always pack via `npm run dist:*` (rebuilds first). `dist-electron/` holds raw CJS copies of `electron/` (synced by `scripts/sync-electron.cjs`) — never hand-edit it.

## Status

- P0 scaffold ✅: overlay shell (bubble + panel + drag/persist + glass + S/M/L + settings store).
- P1 shell ✅: Alt+/ + Alt+Shift+Space global focus, toasts, offline banner, prefs (always-on-top, autostart, notifications) synced main↔renderer, workarea-aware positioning, clamped resize.
- P2 live WhatsApp ✅ (`baileys@7.0.0-rc14` exact pin in main process): QR + pairing-code login, session persist (`wa-auth/`), snapshot cache (`wa-cache/`), chats/messages sync, send text/media, replies, reactions, edit, delete, read receipts, typing presence, group info, in-chat search, native notifications + taskbar flash + badge.
- Verified: `tsc`, `vite build`, Electron+Xvfb launch with live QR event, screenshot review of bubble + QR login + chat list + chat view.
- Fixes: LID→phone resolution + re-keying, junk filtering (status/newsletter/broadcast), archived toggle, contact/group names, profile pictures, protocol edit/revoke sync, new-chat flow, auto-scroll + FAB.

Run the mock UI without linking (screenshots / UI dev): `CHATTT_MOCK=1 npm run dev`.

## Releases (CI)

Push a version tag and two workflows build in parallel, attaching both files to a **draft** release:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

- `release-windows.yml` → Windows installer x64 (`release/*.exe`)
- `release-linux.yml` → Linux AppImage x64 (`release/*.AppImage`)

Review the draft at GitHub → Releases, then publish when ready.

## Credits

Built by **Ali Bashmail <alibashmail2010@yahoo.com>**.
UI/Electron patterns adapted from https://github.com/Ali120B/chatapp (used as local `reference/` only).

See `plan.md`. `reference/` is a read-only clone of https://github.com/Ali120B/chatapp (UI/Electron patterns only, no backend reuse).
