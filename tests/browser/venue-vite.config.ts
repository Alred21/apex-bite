import { defineConfig } from 'vite';

// Extra entry points only for repeatable browser QA. The normal app build stays unchanged.
export default defineConfig({
  cacheDir: '/private/tmp/apex-bite-vite-venue-qa',
  build: {
    outDir: 'dist/venue-qa',
    rollupOptions: { input: { app: 'index.html', sample: 'tests/browser/venue-performance.html' } },
  },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true },
});
