// Vite + vitest (dashboard plan §2.1, §2.2). The server serves dist/ at /dashboard/ (SRV-29);
// in dev, Vite on :5173 proxies the API so the browser sees one origin (the cookie is SameSite=Strict).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.DASHBOARD_API_URL ?? 'http://127.0.0.1:8790';

export default defineConfig({
  base: '/dashboard/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': API, '/files': API },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}', 'test/**/*.test.js'],
    setupFiles: ['src/test/setup.js'],
    testTimeout: 60000,
  },
});
