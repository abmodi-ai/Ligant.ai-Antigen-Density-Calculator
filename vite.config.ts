import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Multi-page build. The antigen density tool stays at the site root so the live
// URL does not change; each additional tool gets its own directory and its own
// bundle, so a visitor downloads only the tool they opened.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cytotoxicity: resolve(__dirname, 'cytotoxicity/index.html'),
      },
    },
  },
})
