import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg'],
      manifest: {
        name: 'Fiesta navideña 2026 · Grupo De Haseth',
        short_name: 'Fiesta Haseth',
        description: 'Invitaciones y registro de llegadas',
        lang: 'es',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F2F2EE',
        theme_color: '#0E3B2E',
        icons: [{ src: 'icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
});
