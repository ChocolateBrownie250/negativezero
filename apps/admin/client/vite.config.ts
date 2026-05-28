import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds are served under https://negativezero.one/services/admin/
// (path-mounted on the apex). Dev keeps base='/' so the Vite proxy and
// dev server work without extra plumbing.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/services/admin/' : '/',
  plugins: [react()],
  // The monorepo workspace root still resolves react@18 (pulled in by another
  // package), while this client pins react@19. Without dedupe Vite bundles
  // both — lucide-react binds to the hoisted react@18 and the app to react@19,
  // producing React error #525 ("element from an older version of React") and
  // a blank screen. Force a single copy.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5174,
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
