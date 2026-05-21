import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds are served under https://negativezero.one/services/bookmark-manager/
// (path-mounted on the apex). Dev keeps base='/' so the Vite proxy and
// dev server work without extra plumbing.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/services/bookmark-manager/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
