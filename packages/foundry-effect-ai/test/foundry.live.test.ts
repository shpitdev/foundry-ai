import { describe, it } from '@effect/vitest';
import { contractOnly, rows } from './matrix.ts';

// Live probes against Foundry over FetchHttpClient; run with `pnpm run test:live:effect`.
// FOUNDRY_RECORD=1 rewrites test/fixtures from the live responses (see docs/PLAN.md, Testing).
for (const { module, liveModels, cells } of rows) {
  describe(`${module} live (${liveModels.join(', ')})`, () => {
    for (const cell of cells.filter((name) => !contractOnly.has(name))) {
      it.todo(cell);
    }
  });
}
