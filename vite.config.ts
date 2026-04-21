import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Sheafy',
        short_name: 'Sheafy',
        description: 'Local-first заметки в формате ленты',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // OPFS / SharedArrayBuffer требуют особых заголовков —
        // service worker не должен перехватывать навигацию
        navigateFallback: null,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        // Не кешируем wasm — он большой и грузится через OPFS
        globIgnores: ['**/*.wasm'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@vlcn.io/crsqlite-wasm']
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party deps into their own chunks so the main
        // app bundle stays small and the browser can cache vendors across
        // app deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'tiptap';
          if (id.includes('@xenova') || id.includes('onnxruntime')) return 'whisper';
          if (id.includes('react-dom')) return 'react-dom';
          if (id.match(/[\\/]react[\\/]/)) return 'react';
          if (id.includes('lucide-react')) return 'lucide';
          if (id.includes('@noble')) return 'crypto-noble';
          if (id.includes('qrcode')) return 'qrcode';
        },
      },
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
})
