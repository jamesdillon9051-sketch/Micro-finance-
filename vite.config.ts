/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Stamps dist/sw.js with a hash of the build (index.html names every hashed asset, so any code change
 * alters it). Each release then gets its own cache, and the service worker file itself changes, which
 * is what makes browsers install the update.
 */
function serviceWorkerVersion(): Plugin {
  const dist = resolve('dist');
  return {
    name: 'service-worker-version',
    apply: 'build',
    closeBundle() {
      const hash = createHash('sha256');
      for (const file of ['index.html', 'manifest.json']) hash.update(readFileSync(join(dist, file)));
      const swPath = join(dist, 'sw.js');
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BUILD_ID__', hash.digest('hex').slice(0, 12)));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerVersion()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
