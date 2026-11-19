import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.live.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    reporters: [
      'verbose',
      [
        'json',
        {
          outputFile: resolve(
            import.meta.dirname,
            `../../.memory/live/${new Date().toISOString().replaceAll(':', '-')}.json`,
          ),
        },
      ],
    ],
    watch: false,
  },
});
