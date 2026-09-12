import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import { startup } from 'vite-plugin-electron'

// We launch Electron manually in npm run dev (see package.json).
startup.prevent = true

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: path.join(import.meta.dirname, 'electron/main.cjs'),
        vite: {
          build: {
            outDir: 'dist-electron',
            rolldownOptions: {
              // wa-service + WA stack stay external: loaded raw from dist-electron
              // at runtime (native rust bridge + ESM baileys can't be bundled).
              external: ['./wa-service.cjs', 'baileys', 'qrcode', 'pino'],
              output: {
                format: 'cjs',
                entryFileNames: 'main.cjs',
              },
            },
          },
        },
      },
      preload: {
        input: path.join(import.meta.dirname, 'electron/preload.cjs'),
        vite: {
          build: {
            rolldownOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  base: './',
})
