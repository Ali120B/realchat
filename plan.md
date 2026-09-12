# chattt — Floating WhatsApp Overlay — Build Plan

> Location: `~/aiprojects/chattt/` (scaffold root) + `reference/` (read-only clone of https://github.com/Ali120B/chatapp).
> Targets: **Windows (NSIS x64) + Linux (AppImage x64 only)**. No mac, no deb.
> Backend: **Baileys in Electron main process**. No Appwrite. No mocks in production.
> UI: full liquid-glass, Roblox-sized overlay. Custom brand (NOT "WhatsApp").

## Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Baileys `~6.7.x` pinned, NOT hidden WA Web view / wwebjs-electron | Hidden `WebContentsView` = ~400MB Chromium + fragile Store/DOM scraping, breaks on WA Web changes, impossible to hit UX rule "tiny widget, NOT WA Web squeezed". Baileys = ~50MB WS, full custom UI control. Same ToS/ban risk either way. |
| 2 | Full chat parity MVP | Text, emoji, replies, reactions, receipts, images, voice, notifications, search, groups day-one. Docs/stickers/GIF/contact/location phase-2. |
| 3 | Clone to `reference/`, reuse UI + Electron shell only | Glass system (`index.css`), `FloatingBubble`, `ChatWindow`, `GlassPanel`, overlay drag/resize hooks, `themeStore`/`uiStore` patterns, `main.cjs` always-on-top/tray/shortcut skeleton. Rewrite backend, auth, chat store. |
| 4 | WA lib: `baileys@7.0.0-rc14` exact pin (spike 2026-09-12: live QR received). 6.7.x uninstallable (`libsignal` git URL blocked by registry policy). V7 = ESM (dynamic `import()` from CJS main), stateless event-driven — own chat/message cache + JSON snapshot. | P2 implemented in `electron/wa-service.cjs`. Re-evaluate when V7 GA lands. |

Risk disclosure: Baileys is unofficial, violates WhatsApp ToS, linked number can be banned anytime without warning. Personal-use only, never primary/business number, no bulk. Shipped banner + README disclaimer required.

## 0. Bootstrap

```bash
ls ~/aiprojects/chattt            # empty at start — verified 2026-09-12
git clone https://github.com/Ali120B/chatapp ~/aiprojects/chattt/reference  # DONE, read-only
npm install
npm run dev        # vite + electron overlay
npm run dev:web    # browser-only, mock WA service (UI dev only)
npm run build
npm run dist:win   # NSIS x64
npm run dist:linux # AppImage x64 only
```

## 1. Reuse vs rewrite map (from `reference/`)

REUSE (copy + adapt, never edit `reference/` in place):
- `electron/main.cjs` → base: frameless transparent always-on-top, `BUBBLE_SIZE=48`/`WINDOW_SIZE=200`, `assertAlwaysOnTop()` + 1s refresh, `set-focusable`, `set-window-position`, `resize-overlay`, `open-external`, win tray, global shortcut, single-instance lock, GPU flags. Remove: `chatoverlay://verify` deep link, Appwrite bits, `electron-updater` (win-only or drop for AppImage simplicity).
- `electron/preload.cjs` → pattern, extend with `wa.*` bridge (§4).
- `src/index.css` → liquid-glass system verbatim: `glass-window/pill/chip/menu/bubble-in/out`, vars `--glass-*-bg/blur`, `--accent-rgb`, animations `fadeIn/slideUp/scaleIn/messagePop/contextMenuIn/staggerFadeIn`, `prefers-reduced-motion` guard. Add opacity/blur vars for settings.
- `src/components/glass/GlassPanel.tsx`, `overlay/FloatingBubble.tsx`, `overlay/ChatWindow.tsx`, `chat/` bubble/list-row/composer shell/date-separator/FAB, `nav/` pill, `settings/` shell.
- `src/hooks/useOverlayDrag.ts`, `useElectronResize.ts`, `useInfiniteScroll.ts`, `useOnlineStatus.ts` patterns.
- `src/store/themeStore.ts` (7 accents), `uiStore.ts` (bubble pos/snap/persist) patterns; `zustand`, `@tanstack/react-virtual`, `tailwindcss` deps.
- `vite.config.ts` (`vite-plugin-electron/simple`), `tsconfig.*`, `index.html` font/shape.

DELETE / DO NOT PORT:
- `appwrite`, `node-appwrite`, `bad-words` mock-E2EE, `scripts/setup-appwrite.mjs`, friends system, polls, temp groups, email auth, Google OAuth docs, `APPWRITE_SETUP.md`.

NEW (own backend):
- `src/main/wa/` Baileys client + auth + media + notifier; renderer `waStore.ts` replacing Appwrite `chatStore.ts` polling with IPC push.

## 2. Architecture

```
Renderer (React 19 + Tailwind v4 + Zustand, custom liquid-glass UI, NO Node)
   ↕ contextBridge window.electronAPI.wa.* (invoke/handle + on-event)
Main: windows/overlay.ts + ipc/wa.ipc.ts + wa/{client,authStore,media,notifier} + services/prefs.ts
   ↕ WebSocket → WhatsApp multi-device (linked device, QR / pairing code)
Disk: userData/wa-auth/ (creds + signal keys, 600), userData/prefs.json, userData/media-cache/ (LRU 300MB)
```

Rules: `contextIsolation:true`, `nodeIntegration:false`, strict TS, allowlist IPC only, validate external URLs (`http/https` → `shell.openExternal`), no `executeJavaScript` bridges.

```
chattt/
├── plan.md
├── reference/            # read-only UI/Electron reference, never build from here
├── package.json
├── vite.config.ts
├── tsconfig*.json
├── index.html
├── electron/
│   ├── main.cjs          # P0: adapted reference shell (CJS for speed)
│   └── preload.cjs       # P0: + wa.* stubs; P2: full bridge
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css         # glass system (from reference)
│   ├── vite-env.d.ts
│   ├── types.ts          # Chat/Msg/Connection/IPC types (shared shape)
│   ├── components/
│   │   ├── glass/GlassPanel.tsx
│   │   ├── overlay/{FloatingBubble,ChatWindow}.tsx
│   │   ├── chat/{ChatList,ChatView,MessageBubble,Composer,SearchBar,ContextMenu,DateSeparator}.tsx
│   │   ├── auth/QrLogin.tsx
│   │   ├── settings/SettingsPanel.tsx
│   │   └── common/{Toasts,OfflineBanner}.tsx
│   ├── hooks/{useOverlayDrag,useElectronResize,useVirtualList}.ts(x)
│   ├── store/{waStore,uiStore,settingsStore,themeStore}.ts
│   └── services/waClient.ts  # renderer-side IPC facade (+ mock for dev:web)
├── src-main/ (P2+)       # TS migration target: wa/client.ts, wa/authStore.ts, wa/media.ts, ipc/wa.ipc.ts
├── assets/ build/        # icon.png (custom brand)
└── README.md             # ban disclaimer + run/packaging docs
```

P0 ships CJS electron shell (fastest path to running window); P2 migrates to `src-main/*.ts` compiled to `dist-electron/`.

## 3. Baileys integration (main process only, P2+)

- Deps: `baileys@7.0.0-rc14` exact + `qrcode` + `pino`. Node >=20. Dynamic `import('baileys')` from CJS main (ESM). Own store: chats/messages Maps + debounced JSON snapshot in `wa-cache/`.
- `makeWASocket({ auth: fileAuth, printQRInTerminal:false, browser:["chattt","Desktop","1.0"] })`.
- Events: `creds.update→save`; `connection.update({qr,connection,lastDisconnect})→renderer`; `messages.upsert→normalize→push+notify`; `messages.update` (receipts/reactions/edits); `presence.update` (typing/online); `chats.upsert/update`; `contacts.upsert`.
- Auth: custom store over `useMultiFileAuthState(userData/wa-auth/)`; single socket; document as demo-grade (SQLite later). `401 logged-out` → wipe → QR screen; else exponential reconnect + keepalive.
- Media: Baileys stream → `media-cache/<msgId>` + thumb; 16MB overlay cap; lazy load; LRU evict. Send: image/voice/doc/video.
- `WaProvider` interface in main so a hidden-WebView fallback stays theoretically possible without renderer changes.

Auth UX states: `connecting → qr (+pairing-code alt) → syncing → ready`. Session persists; no relogin unless logged-out.

## 4. IPC contract (`electron/preload.cjs` + `src/types.ts`)

invoke: `wa:get-state, wa:get-chats, wa:get-messages(chatId,cursor), wa:send-text, wa:send-media, wa:send-voice, wa:react, wa:edit, wa:delete, wa:mark-read, wa:search-chats, wa:search-messages, wa:get-group-info, wa:logout`
events: `wa:qr, wa:connection, wa:chats-upsert, wa:msg-upsert, wa:msg-update, wa:presence, wa:unread`
window/prefs: `set-focusable, set-window-position, resize-overlay, open-external` + `prefs:get/set, notif:click-focus`.

```ts
interface Chat { id:string; name:string; pic?:string|null; isGroup:boolean; lastMsg:string; ts:number; unread:number; muted:boolean; pinned:boolean }
interface Msg { id:string; chatId:string; fromMe:boolean; body:string; type:"text"|"image"|"voice"|"video"|"doc"; ts:number; status:"sent"|"delivered"|"read"|"failed"; replyTo?:string|null; reaction?:string|null; edited?:boolean; starred?:boolean }
type ConnState = "connecting"|"qr"|"syncing"|"ready"|"offline"|"logged-out";
```

## 5. UI spec (liquid glass, Roblox-sized)

- Sizes: S default `380x520` (panel 380x340 + bubble), M `420x640`, L `520x760`. Toggle `48px glass-pill`, draggable, edge-snap, badge `💬 N`, `pulseGlow` on new msg; expand `scaleIn+fadeIn` 200ms.
- Panel `glass-window radius 24 blur 32 saturate 160%`; header `Chats ─ ×`; compact search; virtualized list rows (avatar, name, last msg, time, ticks, unread pill, mute/pin); ChatView bubbles `glass-bubble-in/out`; date separators; typing + online/last-seen; composer `😊 📎 [input] 🎤` autogrow ≤4 lines.
- Context menu (`glass-menu`): Reply/React/Copy/Forward/Star/Pin/Edit/Delete/Select — only supported actions.
- Settings popover: theme (7 accents), transparency, blur, always-on-top (default ON), launch-on-startup, notifications, sound, font size, overlay size/position, unread badge, animations off.
- Shortcuts: toggle overlay, `/` search, focus composer, Esc close, ↑↓ navigate, Enter send.
- States: loading/connecting/disconnected/auth-required/empty-list/empty-chat/searching/sending/uploading/failed/offline/unread/hidden.
- Readability floor: text-shadow + min opacity; solid `rgba(25,27,29,.92)` fallback when blur unsupported. Chats-only nav (no Channels/Status/Communities).

Brand: custom name/logo/accent, `productName` TBD, `appId com.chattt.overlay`. No WhatsApp marks.

## 6. Window behavior

Frameless transparent, `skipTaskbar`, `hasShadow:false`, radius 24, always-on-top toggle (1s re-assert win+linux), persist pos/size (`prefs.json` + `localStorage bubblePos`), header/toggle drag, no accidental resize. Tray win-only. Linux AppImage, no `electron-updater` (drop it).

## 7. Phases + verification

- **P0 scaffold** (this session start): package/vite/ts/electron-shell/glass-css/stores/placeholder views; `dev` opens bubble→panel. Verify: `npm install && npm run dev` shows overlay.
- **P1 shell**: toggle/drag/snap/persist + S/M/L + settings store + shortcuts + toasts. Verify: collapse leaves `● N`, pos survives restart.
- **P2 WA core**: Baileys connect, QR/pairing, persist, chats/messages sync, send/recv text, receipts, presence. Verify: real phone links, 2-device chat works, restart keeps session.
- **P3 rich**: replies/reactions/edit/delete/forward/star/pin, group meta/mentions, search, context menus. Verify each vs real account; unsupported → disabled with tooltip.
- **P4 media**: image/voice/doc/video render+send, cache+progress, mic perms. Verify 16MB image + voice roundtrip.
- **P5 notify**: native `Notification`, badge, mute respect, click-focus. Verify muted silent.
- **P6 polish/pack**: virtualization, cold start <3s target, idle ~0 CPU, `dist:win` NSIS + `dist:linux` AppImage smoke on clean machines.
- **P7 hardening**: IPC audit, URL validation, auth file perms, README ban disclaimer, packaging docs.

Rule: `dev:web` mock for UI dev only; never ship mock as "working WA".

## 8. Build config

`electron-builder`: `appId com.chattt.overlay`, `productName` TBD, `output release/`, `files [dist/**, dist-electron/**, build/icon.png]`, `win {nsis x64}`, `linux {AppImage x64}` — strip `deb/dmg/ia32`. Publish: none for now (drop reference's github publish until repo set).

## 9. Open items

- [ ] Final product name + icon (custom, non-WhatsApp).
- [ ] Pairing-code vs QR-only login (Baileys supports both — expose both if cheap).
- [ ] SQLite auth store (later) vs file store (P2).
- [ ] libsignal GPLv3 tree check before distributing.
- [ ] Wayland transparency fallback verification on Linux.
