import { describe, it } from '@effect/vitest';
import { decisionRow, languageRows } from './matrix.ts';

// Live probes against Foundry over FetchHttpClient; run with `pnpm run test:live:effect`.
// FOUNDRY_RECORD=1 rewrites test/fixtures from the live responses with credentials redacted.
describe.each(languageRows)('$module live ($liveModel)', ({ capabilities }) => {
  for (const capability of capabilities) {
    it.todo(capability);
  }
});

describe(`${decisionRow.module} live (${decisionRow.liveModel})`, () => {
  for (const name of decisionRow.cases) {
    it.todo(name);
  }
});
