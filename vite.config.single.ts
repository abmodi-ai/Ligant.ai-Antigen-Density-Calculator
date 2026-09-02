import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Emits one self-contained HTML file (dist-single/index.html) for demos and
// artifact publishing. Functionally identical to the normal build.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
})
