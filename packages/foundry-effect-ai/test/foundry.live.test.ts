import { describe, it } from '@effect/vitest';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as FoundryClient from '../src/FoundryClient.ts';
import type { Fixture } from './FakeFoundry.ts';
import { loadCells, scrubber, writeFixtures } from './harness.ts';
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
          const scrub = scrubber({ host: new URL(foundryUrl).host, token: Redacted.value(token) });
          const recordings: Array<Promise<Fixture>> = [];
          // Records a clone of each Web response; the clone tees the body, so the model reads
          // its copy as it arrives. Cancelling a stream early waits for the copy to finish.
          const recorder = HttpClient.transformResponse(
            Effect.map((response) =>
              Option.match(HttpClientResponse.toWeb(response), {
                onNone: () => response,
                onSome: (web) => {
                  recordings.push(
                    web
                      .clone()
                      .text()
                      .then((body) => ({
                        status: web.status,
                        contentType: web.headers.get('content-type') ?? '',
                        body: scrub(body),
                      })),
                  );
                  return HttpClientResponse.fromWeb(response.request, web);
                },
              }),
            ),
          );
          const transformClient = record ? recorder : undefined;
          // The default client reads FOUNDRY_* through layerConfig; overrides need explicit options.
          const client = (overrides?: Partial<FoundryClient.Options>) =>
            (overrides === undefined
              ? Layer.orDie(FoundryClient.layerConfig({ transformClient }))
              : FoundryClient.layer({ foundryUrl, token, transformClient, ...overrides })
            ).pipe(Layer.provide(FetchHttpClient.layer));
          yield* run({ live: true, client, requests: [] });
          if (record) {
            writeFixtures(module, cell, yield* Effect.promise(() => Promise.all(recordings)));
          }
        }),
      );
    }
  });
}
