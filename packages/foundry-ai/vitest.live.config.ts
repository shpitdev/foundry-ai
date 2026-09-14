import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.live.test.ts'],
    exclude: ['src/__tests__/realtime.live.test.ts'],
    maxConcurrency: Number(process.env.LIVE_CAPABILITY_MAX_CONCURRENCY ?? 3),
    reporters: ['verbose'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    watch: false,
  },
});
