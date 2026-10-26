import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs on :5180; production builds are served by the .NET app itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5180' },
  },
  build: {
    outDir: '../backend/wwwroot',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
})
