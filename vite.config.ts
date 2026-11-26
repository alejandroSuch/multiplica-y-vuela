import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/multiplica-y-vuela/',
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: '/multiplica-y-vuela/',
      name: '¡Multiplica y vuela!',
      short_name: 'Multiplica',
      description: 'Un juego de globos para practicar las tablas de multiplicar.',
      lang: 'es',
      start_url: '/multiplica-y-vuela/',
      scope: '/multiplica-y-vuela/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#83d8ed',
      theme_color: '#83d8ed',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,ttf,mp3}'],
      cleanupOutdatedCaches: true,
    },
  })],
});
