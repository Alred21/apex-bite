import { defineConfig } from 'vite';
export default defineConfig({
  cacheDir: '/private/tmp/apex-bite-vite-review-dialog',
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
});
