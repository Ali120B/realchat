# chattt — floating WhatsApp overlay

A tiny WhatsApp chat widget that floats over your desktop. Link your phone once, then chat without keeping WhatsApp open.

> Unofficial client for personal use. Automating a number violates WhatsApp's terms and can get it banned — use a spare number, never your primary.

## Download

Get the latest Windows installer or Linux AppImage from the Releases page (published from draft releases).

## Link your phone

1. Open chattt and pick **Scan QR**, or **Pairing code** and enter your number.
2. On your phone: WhatsApp → Settings → Linked devices → Link a device.
3. Scan the code (or enter the pairing code). Chats sync in a few seconds.

## Using it

- The bubble is the hidden state. Click it to open, X to hide.
- Drag the bubble (hidden) or the header bar (open) to move it anywhere.
- Global hotkeys: Alt+/ or Alt+Shift+Space focuses the overlay from anywhere.
- Inside: `/` searches chats, Enter sends, Esc hides.
- New chat button (pencil) next to search starts a conversation by phone number.
- Settings covers theme, overlay size (S/M/L), transparency, always-on-top, launch on startup, notifications, and archived chats.

## Window managers (Hyprland)

On Wayland the app runs through XWayland automatically (native Wayland forbids
programmatic move/resize/focus, which an overlay needs) and asks the compositor
to float it as a toolbar window. No setup needed in most cases — set
`CHATTT_NATIVE_WAYLAND=1` to opt out back to native Wayland.

If it still tiles, force it with a rule — find the class first:

```bash
hyprctl clients | grep -i -A2 chattt
```

Then add rules (adjust the class if yours differs):

```ini
windowrule = float, class:^(chattt)$
windowrule = size 380 340, class:^(chattt)$
windowrule = pin, class:^(chattt)$
windowrule = noborder, class:^(chattt)$
```

`pin` keeps it above other windows (the in-app always-on-top toggle handles the rest).

## If chats look wrong

- **Duplicate chats**: WhatsApp addresses the same person two ways; the app merges them automatically within about a minute of launching. If a pair survives, use Settings → Log twin diagnostics and check the terminal output.
- **Stale ghosts**: Settings → Clear cache and resync chats wipes local state (login kept) and pulls everything fresh.
- **Names/photos**: contact names and pictures enrich in the background after linking; numbers with strict privacy show initials instead.

---

## Developer docs

Stack: Electron + React 19 + TypeScript + Tailwind + Zustand + Baileys (WhatsApp Web protocol, main process only).

```bash
npm install
npm run dev       # overlay (vite + electron)
npm run dev:web   # browser-only UI dev (mock data)
npm run build     # typecheck + web build + electron shell sync
npm run smoke:wa  # service boot test (no phone needed)
npm run dist:win  # Windows NSIS x64
npm run dist:linux# Linux AppImage x64 only
```

`CHATTT_MOCK=1 npm run dev` previews the UI without linking.

### Layout

```
electron/          main.cjs (window, tray, shortcuts, IPC), preload.cjs, wa-service.cjs (Baileys)
src/               App, components/{chat,auth,settings,overlay,glass,common}, store/*, hooks/*
scripts/           sync-electron.cjs (raw CJS copy), after-pack.cjs (locale trim), smoke-wa.cjs
.github/workflows  release-windows.yml, release-linux.yml (tag v* -> draft release)
reference/         read-only UI reference clone, never shipped
```

`dist-electron/` holds raw copies of `electron/` — never hand-edit it. The web bundler is intentionally not involved in the main process (native/ESM deps break under bundling).

### Releases

```bash
git tag v1.0.1 && git push origin v1.0.1
```

Both CIs build in parallel and attach the installer + AppImage to the tag's draft release. Review it on GitHub and publish when ready.

### Debugging

Run `npm run dev` and watch the terminal. Useful lines:

- `connection → ...` — link state machine
- `synced N chats, M messages` — history sync result
- `contacts: N total, ... K phone-saved` — address-book sync health
- `merged twin ... (reason)` — duplicate-chat merges with masked ids
- `meta refresh: +X group names, +Y pictures` — enrichment results
- `twin group ...` (via Settings → Log twin diagnostics) — unmerged pairs

### Credits

Built by Ali Bashmail <alibashmail2010@yahoo.com>. UI/Electron patterns adapted from https://github.com/Ali120B/chatapp (local `reference/` only).
