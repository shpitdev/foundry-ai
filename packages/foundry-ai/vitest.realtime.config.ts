import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['src/__tests__/realtime.live.test.ts'],
    testTimeout: 180_000,
    reporters: ['verbose'],
    watch: false,
  },
});
