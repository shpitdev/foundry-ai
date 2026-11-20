import { describe, it } from '@effect/vitest';
import { rows } from './matrix.ts';

// Offline contract tests: each cell replays recorded Foundry fixtures through FakeFoundry and
// asserts the golden request and the decoded Effect AI result.
describe.each(rows)('$module (phase $phase)', ({ cells }) => {
  for (const cell of cells) {
    it.todo(cell);
  }
});
