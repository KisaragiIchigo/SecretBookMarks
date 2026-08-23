import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' は file:// 起動（本番exe）でアセットを相対解決させるために必須。
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'chrome128',
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
