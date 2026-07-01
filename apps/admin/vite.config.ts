import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev server and the production `vite preview` bind on all interfaces and
  // accept any Host header, so the panel is reachable over the LAN / WireGuard
  // (e.g. http://192.168.88.127:5173) and not just localhost.
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
})
