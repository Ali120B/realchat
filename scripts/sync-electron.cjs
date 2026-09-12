// Copies the raw Electron main/preload/service files into dist-electron/.
// Used by `npm run dev` (before Electron launches) and `npm run build`.
// They are plain Node CJS on purpose: bundling them breaks native/ESM
// dependencies (Baileys, whatsapp-rust-bridge) and flips module formats.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const out = path.join(root, 'dist-electron')
fs.mkdirSync(out, { recursive: true })
for (const file of ['main.cjs', 'preload.cjs', 'wa-service.cjs']) {
  fs.cpSync(path.join(root, 'electron', file), path.join(out, file))
}
console.log('[chattt] electron shell synced to dist-electron/')
