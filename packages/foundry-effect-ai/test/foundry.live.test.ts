import { describe, it } from '@effect/vitest';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as Layer from 'effect/Layer';
import * as FoundryClient from '../src/FoundryClient.ts';
import type { Fixture } from './FakeFoundry.ts';
import { loadCells, scrub, writeFixtures } from './harness.ts';
import { contractOnly, rows } from './matrix.ts';

// Live probes against Foundry over FetchHttpClient; run with `pnpm run test:live:effect`.
// FOUNDRY_RECORD=1 rewrites each passing cell's test/fixtures file from the live responses.
const settings = Config.all({
  foundryUrl: Config.String('FOUNDRY_URL'),
  token: Config.Redacted('FOUNDRY_TOKEN'),
  record: Config.Boolean('FOUNDRY_RECORD').pipe(Config.withDefault(false)),
});

for (const { module, liveModels, cells } of rows) {
  const implemented = await loadCells(module);
  describe(`${module} live (${liveModels.join(', ')})`, () => {
    const live = cells.filter((name) => !contractOnly.has(name));
    for (const cell of live.filter((name) => implemented?.[name] === undefined)) {
      it.todo(cell);
    }
    for (const [cell, run] of Object.entries(implemented ?? {}).filter(([name]) =>
      live.includes(name),
    )) {
      it.live(cell, () =>
        Effect.gen(function* () {
          const { foundryUrl, token, record } = yield* settings;
          const host = new URL(foundryUrl).host;
          const recorded: Array<Fixture> = [];
          const recorder = HttpClient.tap((response) =>
            Effect.map(
              Effect.orElseSucceed(response.text, () => ''),
              (body) => {
                recorded.push({
                  status: response.status,
                  contentType: response.headers['content-type'] ?? '',
                  body: scrub(body, host),
                });
              },
            ),
          );
          const client = (overrides?: Partial<FoundryClient.Options>) =>
            FoundryClient.layer({
              foundryUrl,
              token,
              transformClient: recorder,
              ...overrides,
            }).pipe(Layer.provide(FetchHttpClient.layer));
          yield* run({ live: true, client, requests: [] });
          if (record) {
            writeFixtures(module, cell, recorded);
          }
        }),
      );
    }
  });
}
