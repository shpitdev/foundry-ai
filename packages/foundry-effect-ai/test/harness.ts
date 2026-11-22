/**
 * Shared machinery for the matrix suites. A module's cells live in `test/cells/<Module>.ts` as
 * one Effect program per cell, run offline over its fixtures and live over Foundry; the suites
 * load that file by module name, so a phase adds cells without editing them.
 */
// Test tooling that runs before any Effect does: plain fs and a dynamic import.
// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import type * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import type * as Redacted from 'effect/Redacted';
import type * as Socket from 'effect/socket/Socket';
import type * as FoundryClient from '../src/FoundryClient.ts';
import { type CapturedRequest, type Fixture, proxyPath } from './FakeFoundry.ts';
import type { CapturedSession, SocketFixture } from './FakeSocket.ts';

export interface Env {
  readonly live: boolean;
  /** A FoundryClient from the suite's settings, with any overrides (e.g. a bad token). */
  readonly client: (
    overrides?: Partial<FoundryClient.Options>,
  ) => Layer.Layer<FoundryClient.FoundryClient>;
  /** Requests sent so far; empty when live. */
  readonly requests: ReadonlyArray<CapturedRequest>;
  /** The suite's stack URL and token, for modules that connect without FoundryClient. */
  readonly settings: { readonly foundryUrl: string; readonly token: Redacted.Redacted };
  /** WebSocket transport: replays recorded sessions offline, the global WebSocket live. */
  readonly sockets: Layer.Layer<Socket.WebSocketConstructor>;
  /** Sockets opened so far; empty when live. */
  readonly sessions: ReadonlyArray<CapturedSession>;
}

/** Runs one matrix cell; assertions throw. */
export type Cell = (env: Env) => Effect.Effect<void, AiError.AiError>;

/** What `test/cells/<Module>.ts` exports. */
export interface CellModule {
  /** The row's cells on its default models, recorded in the fixtures. */
  readonly cells: Readonly<Record<string, Cell>>;
  /** The live cells for any catalog model; a `LIVE_MODELS` sweep runs these per model. */
  readonly cellsFor?: (model: string) => Readonly<Record<string, Cell>>;
}

export const loadCells = async (module: string): Promise<CellModule | undefined> => {
  const file = new URL(`cells/${module}.ts`, import.meta.url);
  if (!existsSync(file)) {
    return undefined;
  }
  return (await import(file.href)) as CellModule;
};

const fixtureFile = (module: string, cell: string, kind: 'json' | 'synthetic.json') =>
  new URL(`fixtures/${module}/${cell}.${kind}`, import.meta.url);

/** An HTTP exchange, or a realtime socket session. */
export type AnyFixture = Fixture | SocketFixture;

const readFile = (file: URL): ReadonlyArray<AnyFixture> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ReadonlyArray<AnyFixture>) : [];

/** Recorded fixtures, then the hand-written `<cell>.synthetic.json` ones. */
export const readFixtures = (module: string, cell: string): ReadonlyArray<AnyFixture> => [
  ...readFile(fixtureFile(module, cell, 'json')),
  ...readFile(fixtureFile(module, cell, 'synthetic.json')),
];

/**
 * A replay sends one request per fixture, each matching the request recorded with it: path and
 * body exactly, and any pinned headers.
 */
export const expectGoldenRequests = (
  fixtures: ReadonlyArray<Fixture>,
  requests: ReadonlyArray<CapturedRequest>,
): void => {
  expect(requests).toHaveLength(fixtures.length);
  for (const [index, fixture] of fixtures.entries()) {
    const sent = requests[index];
    if (fixture.request !== undefined && sent !== undefined) {
      const { headers, ...golden } = fixture.request;
      expect({ path: proxyPath(sent.url), body: sent.body }).toEqual(golden);
      expect(sent.headers).toMatchObject(headers ?? {});
    }
  }
};

/**
 * A replay dials one socket per recorded session, each at the recorded URL, and sends exactly the
 * recorded client frames.
 */
export const expectGoldenSessions = (
  fixtures: ReadonlyArray<SocketFixture>,
  sessions: ReadonlyArray<CapturedSession>,
): void => {
  expect(sessions.map(({ url, sent }) => ({ url, sent }))).toEqual(
    fixtures.map(({ url, frames }) => ({
      url,
      sent: frames.flatMap((frame) => ('sent' in frame ? [frame.sent] : [])),
    })),
  );
};

/** Replaces a cell's recording; an empty one would erase a known-good fixture, so it throws. */
export const writeFixtures = (
  module: string,
  cell: string,
  fixtures: ReadonlyArray<AnyFixture>,
): void => {
  if (fixtures.length === 0) {
    throw new Error(`${module} ${cell}: nothing was recorded; the fixture is unchanged.`);
  }
  const file = fixtureFile(module, cell, 'json');
  mkdirSync(new URL('.', file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(fixtures, null, 2)}\n`);
};

const modelRid = 'ri.language-model-service..language-model.';
// An ID key, possibly inside JSON that is itself a string, then its value of 8+ characters.
const idValue =
  /\\*"(?:errorInstanceId|id|responseId|response_id|request_id|requestId|trace_id|traceId)\\*"\s*:\s*\\*"([^"\\]{8,})/gu;

/**
 * A scrubber for one cell's recordings, which are committed. It replaces the token, any bearer
 * credential, the stack host, RIDs that are not model RIDs, and ID values. Each ID gets the
 * same placeholder everywhere in the cell, so stream events and replayed tool turns that
 * mention it still agree.
 */
export const scrubber = (secrets: { readonly host: string; readonly token: string }) => {
  const host = new RegExp(secrets.host.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu');
  const ids = new Map<string, string>();
  return (body: string): string => {
    const scrubbed = (
      secrets.token === '' ? body : body.replaceAll(secrets.token, 'redacted-token')
    )
      .replaceAll(/Bearer\s+[\w.~+/=-]+/gu, 'Bearer redacted-token')
      .replaceAll(host, 'example.palantirfoundry.com')
      .replaceAll(/ri\.[a-z0-9-]+\.[\w.-]*/gu, (rid) =>
        rid.startsWith(modelRid) ? rid : 'ri.redacted',
      );
    for (const [, id = ''] of scrubbed.matchAll(idValue)) {
      if (!ids.has(id)) {
        ids.set(id, `redacted-id-${ids.size + 1}`);
      }
    }
    return [...ids].reduce((text, [id, placeholder]) => text.replaceAll(id, placeholder), scrubbed);
  };
};
