import { describe, it } from '@effect/vitest';
import * as FakeFoundry from './FakeFoundry.ts';
import { loadCells, readFixtures } from './harness.ts';
import { rows } from './matrix.ts';

// Offline contract tests: each cell replays recorded Foundry fixtures through FakeFoundry and
// asserts the golden request and the decoded Effect AI result.
for (const { module, phase, cells } of rows) {
  const implemented = await loadCells(module);
  describe(`${module} (phase ${phase})`, () => {
    for (const cell of cells.filter((name) => implemented?.[name] === undefined)) {
      it.todo(cell);
    }
    for (const [cell, run] of Object.entries(implemented ?? {}).filter(([name]) =>
      cells.includes(name),
    )) {
      it.effect(cell, () => {
        const fake = FakeFoundry.replay(...readFixtures(module, cell));
        return run({ live: false, client: fake.client, requests: fake.requests });
      });
    }
  });
}
