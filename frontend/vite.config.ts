import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The API runs on 6767 (http) / 6969 (https) — see
 * backend/BiletFlow.Api/Properties/launchSettings.json.
 *
 * Program.cs calls app.UseHttpsRedirection(), so when both ports are bound
 * a request to 6767 is answered with a 307 to 6969. Proxying straight to the
 * https port avoids that; `secure: false` accepts the dev certificate.
 *
 * Override with VITE_API_PROXY_TARGET=http://localhost:6767 if you run the
 * http-only launch profile.
 */
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'https://localhost:6969'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
