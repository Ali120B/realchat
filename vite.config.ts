import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// NOTE: no vite-plugin-electron here on purpose. The Electron main/preload
// service files are plain Node CJS that need zero bundling — the bundler's dev
// watch used to rewrite dist-electron/main.cjs into ESM and crash the app on
// `npm run dev`. Instead, scripts/sync-electron.cjs copies the raw files
// (dev + build), which is also what keeps native/ESM deps like Baileys working.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  base: './',
})
