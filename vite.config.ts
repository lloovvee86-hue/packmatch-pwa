import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './', // 어떤 레포지토리 이름에서도 겹치지 않고 상대 경로로 완벽 구동
  server: {
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
      manifest: {
        name: '풀무원 PackMatch - 포장재 검수',
        short_name: 'PackMatch',
        description: '풀무원 디자인 시안 vs 포장재 실사 텍스트 OCR 검수',
        theme_color: '#5cb85c',
        background_color: '#f7fafc',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    include: ['tesseract.js'],
  },
  build: {
    chunkSizeWarningLimit: 20000,
  },
})
