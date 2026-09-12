// electron-builder afterPack hook: trim per-platform bloat.
// - Drops all Chromium locales except en-US (~45MB saved per target).
// Safe: only affects UI language fallback packs, never app code.
const fs = require('node:fs')
const path = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
async function afterPack(context) {
  const { appOutDir } = context
  const localesDir = path.join(appOutDir, 'locales')
  let removed = 0
  try {
    const entries = fs.readdirSync(localesDir)
    for (const entry of entries) {
      if (entry === 'en-US.pak') continue
      fs.rmSync(path.join(localesDir, entry), { force: true })
      removed += 1
    }
  } catch {
    // no locales dir (e.g. mac) — nothing to do
  }
  if (removed > 0) console.log(`[chattt] afterPack: removed ${removed} locale packs`)
}

module.exports = afterPack
