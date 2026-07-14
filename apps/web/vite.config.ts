import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // framer-motion alone is ~100kB minified and is used by almost every
    // page — keeping it in its own vendor chunk lets the browser cache
    // it across deploys that only touch app code. Same for the React
    // and react-query runtimes.
    //
    // Page-specific heavy deps (browser-image-compression, exifr, embla,
    // react-markdown) are *not* listed here on purpose — they're only
    // imported by lazy-loaded routes, so Rollup already places them in
    // their own per-route chunk and they never ship to users who don't
    // open those pages.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          query: ['@tanstack/react-query'],
        },
      },
    },
    // After the splits above no app chunk crosses 500kB; bump the
    // warning ceiling slightly so the framer-motion vendor chunk
    // doesn't trigger the noisy warning on every build.
    chunkSizeWarningLimit: 600,
  },
});
