import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component specs need a document; the manifest spec opts into `node`.
    environment: 'jsdom',
    include: ['tests/**/*.spec.js'],
    setupFiles: ['tests/support/setup.js'],
    globals: false,
  },
});
