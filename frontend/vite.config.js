import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration.
 *
 * In development the frontend calls the API on a relative `/api` path and Vite
 * proxies it to the Express server, so there is no CORS preflight and no API
 * URL to configure locally. In production `VITE_API_URL` is baked in at build
 * time and points at the deployed backend.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Leaflet is only needed on pages that render a map; keep it in its own
        // chunk so the discovery pages stay small.
        manualChunks: {
          leaflet: ['leaflet', 'react-leaflet'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
