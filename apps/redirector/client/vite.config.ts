import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds are served under https://negativezero.one/services/redirector/
// (path-mounted on the apex). Dev keeps base='/' so the Vite proxy and dev
// server work without extra plumbing.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/services/redirector/' : '/',
  plugins: [react()],
  server: {
    port: 5176,
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
