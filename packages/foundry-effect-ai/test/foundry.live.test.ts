import { describe, it } from '@effect/vitest';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Socket from 'effect/socket/Socket';
import * as FoundryClient from '../src/FoundryClient.ts';
import { type Fixture, proxyPath, unpinnedHeaders } from './FakeFoundry.ts';
import * as FakeSocket from './FakeSocket.ts';
import { type Cell, loadCells, scrubber, writeFixtures } from './harness.ts';
import { catalog, contractOnly, type Row, rows } from './matrix.ts';

// Live probes against Foundry over FetchHttpClient; run with `pnpm run test:live:effect`.
// FOUNDRY_RECORD=1 rewrites each passing cell's test/fixtures file from the live responses.
const settings = Config.all({
  foundryUrl: Config.String('FOUNDRY_URL'),
  token: Config.Redacted('FOUNDRY_TOKEN'),
});
const options = Effect.runSync(
  Config.all({
    record: Config.Boolean('FOUNDRY_RECORD').pipe(Config.withDefault(false)),
    selection: Config.String('LIVE_MODELS').pipe(Config.withDefault('')),
  }),
);

/**
 * `LIVE_MODELS` sweeps past the defaults: a comma list of `all`, provider names or catalog model
 * IDs, as in packages/foundry-ai. Unknown tokens fail the run. Undefined when unset.
 */
const tokens = ((): ReadonlyArray<string> | undefined => {
  const raw = options.selection.trim();
  if (raw === '') {
    return undefined;
  }
  const list = raw
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '');
  const vendors = new Set(catalog.values());
  const unknown = list.filter(
    (token) => token !== 'all' && !vendors.has(token) && !catalog.has(token),
  );
  if (list.length === 0 || unknown.length > 0) {
    throw new Error(
      `Unknown LIVE_MODELS token(s): ${unknown.join(', ') || raw}. Use all, ${[...vendors].join(', ')}, or catalog model IDs.`,
    );
  }
  if (options.record) {
    throw new Error('FOUNDRY_RECORD records the default models; unset LIVE_MODELS.');
  }
  return list;
})();

const selected = (row: Row): ReadonlyArray<string> =>
  tokens === undefined
    ? row.liveModels
    : row.sweep.filter((id) =>
        tokens.some((token) => token === 'all' || token === id || token === catalog.get(id)),
      );

/** Runs one cell over Foundry, recording its exchanges when `record` is set. */
const probe = (module: string, cell: string, run: Cell, record: boolean) =>
  Effect.gen(function* () {
    const { foundryUrl, token } = yield* settings;
    const recordings: Array<
      Promise<{
        readonly path: string;
        readonly headers: Record<string, string>;
        readonly sent: string;
        readonly response: Fixture;
      }>
    > = [];
    // Records each exchange from a clone of the Web response; the clone tees the body, so the
    // caller reads its copy as it arrives. Cancelling a stream early waits for the copy.
    const capture = (response: HttpClientResponse.HttpClientResponse) =>
      Option.match(HttpClientResponse.toWeb(response), {
        onNone: () => response,
        onSome: (web) => {
          const { body } = response.request;
          const path = proxyPath(web.url);
          const headers = Object.fromEntries(
            Object.entries(response.request.headers).filter(([name]) => !unpinnedHeaders.has(name)),
          );
          const sent = body._tag === 'Uint8Array' ? new TextDecoder().decode(body.body) : '';
          recordings.push(
            web
              .clone()
              .text()
              .then((text) => ({
                path,
                headers,
                sent,
                response: {
                  status: web.status,
                  contentType: web.headers.get('content-type') ?? '',
                  body: text,
                },
              })),
          );
          return HttpClientResponse.fromWeb(response.request, web);
        },
      });
    // Failed statuses reach `transformClient` as `StatusCodeError`; record their responses too.
    const recorder = (client: HttpClient.HttpClient) =>
      client.pipe(
        HttpClient.transformResponse(Effect.map(capture)),
        HttpClient.tapError((error) =>
          Effect.sync(() => {
            if (error.reason._tag === 'StatusCodeError') {
              capture(error.reason.response);
            }
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
    const socketRecorder = record ? FakeSocket.record() : undefined;
    yield* run({
      live: true,
      client,
      requests: [],
      settings: { foundryUrl, token },
      sockets: socketRecorder?.layer ?? Socket.layerWebSocketConstructorGlobal,
      sessions: [],
    });
    if (record) {
      // One scrubber, in exchange order, so an ID keeps its placeholder across the cell.
      const scrub = scrubber({
        host: new URL(foundryUrl).host,
        token: Redacted.value(token),
      });
      const exchanges = yield* Effect.promise(() => Promise.all(recordings));
      const sessions = (socketRecorder?.sessions ?? []).map(
        (session): FakeSocket.SocketFixture => ({
          url: scrub(session.url),
          frames: session.frames.map(
            (frame) => JSON.parse(scrub(JSON.stringify(frame))) as FakeSocket.Frame,
          ),
          ...(session.close === undefined
            ? undefined
            : { close: { ...session.close, reason: scrub(session.close.reason) } }),
        }),
      );
      writeFixtures(module, cell, [
        ...exchanges.map(({ path, headers, sent, response }) => {
          const request = scrub(sent);
          return {
            ...response,
            request: {
              path,
              body: request === '' ? undefined : JSON.parse(request),
              headers,
            },
            body: scrub(response.body ?? ''),
          };
        }),
        ...sessions,
      ]);
    }
  });

/** Live cells of a row, with a todo for each that has no program yet. */
const probes = (
  row: Row,
  implemented: Readonly<Record<string, Cell>> | undefined,
  record: boolean,
) => {
  const live = row.cells.filter((name) => !contractOnly.has(name));
  for (const cell of live.filter((name) => implemented?.[name] === undefined)) {
    it.todo(cell);
  }
  for (const [cell, run] of Object.entries(implemented ?? {}).filter(([name]) =>
    live.includes(name),
  )) {
    it.live(cell, () => probe(row.module, cell, run, record));
  }
};

// Unset, each row runs its recorded cells on its default models. A sweep runs a module's
// `cellsFor` once per selected model, or its default cells once if it has no `cellsFor`; it
// never records, and a cell `cellsFor` leaves out for a model is not tested.
for (const row of rows) {
  const loaded = await loadCells(row.module);
  const models = selected(row);
  const { cellsFor } = loaded ?? {};
  if (tokens === undefined || cellsFor === undefined) {
    if (models.length > 0) {
      describe(`${row.module} live (${row.liveModels.join(', ')})`, () => {
        probes(row, loaded?.cells, options.record);
      });
    }
  } else {
    for (const model of models) {
      const cells = cellsFor(model);
      describe(`${row.module} live (${model})`, () => {
        for (const [cell, run] of Object.entries(cells).filter(
          ([name]) => row.cells.includes(name) && !contractOnly.has(name),
        )) {
          it.live(cell, () => probe(row.module, cell, run, false));
        }
      });
    }
  }
}
