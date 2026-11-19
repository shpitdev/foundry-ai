import { describe, it } from '@effect/vitest';
import { decisionRow, languageRows } from './matrix.ts';

// Offline contract tests: each cell replays a recorded Foundry fixture through FakeFoundry and
// asserts the golden request and the decoded Effect AI result.
describe.each(languageRows)('$module (phase $phase)', ({ capabilities }) => {
  for (const capability of capabilities) {
    it.todo(capability);
  }
});

describe(`${decisionRow.module} (phase ${decisionRow.phase})`, () => {
  for (const name of decisionRow.cases) {
    it.todo(name);
  }
});
