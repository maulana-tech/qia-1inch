import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      // @1inch/aqua-sdk memanggil `assert` Node di dalam Address/HexString, dan
      // membangun objek itu saat modul dimuat. Tanpa pengganti ini, mengimpor
      // SDK-nya membuat seluruh halaman kosong.
      assert: fileURLToPath(new URL('./src/shims/assert.ts', import.meta.url)),
    },
  },
  define: {
    // The proof tooling references `global` in the browser.
    global: 'globalThis',
  },
})
