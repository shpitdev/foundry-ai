import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['src/__tests__/decisions.live.test.ts'],
    testTimeout: 120_000,
    reporters: ['verbose'],
    watch: false,
  },
});
