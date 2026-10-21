import { defineConfig } from 'vite';

// Extra entry points only for repeatable browser QA. The normal app build stays unchanged.
export default defineConfig({
  cacheDir: '/private/tmp/apex-bite-vite-iteration-3-qa',
  build: {
    outDir: 'dist/venue-qa',
    rollupOptions: { input: { app: 'index.html', sample: 'tests/browser/venue-performance.html', controls: 'tests/browser/controls.html', dialogs: 'tests/browser/dialog-focus.html', recovery: 'tests/browser/recovery.html', audio: 'tests/browser/kart-audio.html' } },
  },
  preview: { host: '127.0.0.1', port: 5196, strictPort: true },
});
