import { copyFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    {
      name: 'spa-github-pages-fallback',
      closeBundle() {
        try {
          copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'))
          writeFileSync(resolve('dist/.nojekyll'), '')
        } catch {
          /* build output may be missing in some vite internals */
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve('src'),
    },
  },
})
