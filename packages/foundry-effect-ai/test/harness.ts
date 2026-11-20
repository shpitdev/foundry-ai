/**
 * Shared machinery for the matrix suites. A module's cells live in `test/cells/<Module>.ts` as
 * one Effect program per cell, run offline over its fixtures and live over Foundry; the suites
 * load that file by module name, so a phase adds cells without editing them.
 */
// Test tooling that runs before any Effect does: plain fs and a dynamic import.
// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type * as AiError from 'effect/ai/AiError';
import type * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import type * as FoundryClient from '../src/FoundryClient.ts';
import type { CapturedRequest, Fixture } from './FakeFoundry.ts';

export interface Env {
  readonly live: boolean;
  /** A FoundryClient from the suite's settings, with any overrides (e.g. a bad token). */
  readonly client: (
    overrides?: Partial<FoundryClient.Options>,
  ) => Layer.Layer<FoundryClient.FoundryClient>;
  /** Requests sent so far; empty when live. */
  readonly requests: ReadonlyArray<CapturedRequest>;
}

/** Runs one matrix cell; assertions throw. */
export type Cell = (env: Env) => Effect.Effect<void, AiError.AiError>;

export const loadCells = async (
  module: string,
): Promise<Readonly<Record<string, Cell>> | undefined> => {
  const file = new URL(`cells/${module}.ts`, import.meta.url);
  if (!existsSync(file)) {
    return undefined;
  }
  const loaded = (await import(file.href)) as { readonly cells: Readonly<Record<string, Cell>> };
  return loaded.cells;
};

const fixtureFile = (module: string, cell: string, kind: 'json' | 'synthetic.json') =>
  new URL(`fixtures/${module}/${cell}.${kind}`, import.meta.url);

const readFile = (file: URL): ReadonlyArray<Fixture> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ReadonlyArray<Fixture>) : [];

/** Recorded fixtures, then the hand-written `<cell>.synthetic.json` ones. */
export const readFixtures = (module: string, cell: string): ReadonlyArray<Fixture> => [
  ...readFile(fixtureFile(module, cell, 'json')),
  ...readFile(fixtureFile(module, cell, 'synthetic.json')),
];

export const writeFixtures = (
  module: string,
  cell: string,
  fixtures: ReadonlyArray<Fixture>,
): void => {
  const file = fixtureFile(module, cell, 'json');
  mkdirSync(new URL('.', file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(fixtures, null, 2)}\n`);
};

const modelRid = 'ri.language-model-service..language-model.';

/**
 * Recordings are committed, so they keep only status, content type and body, and drop the stack
 * host, RIDs that are not model RIDs, and request, trace and error-instance IDs.
 */
export const scrub = (body: string, host: string): string =>
  body
    .replaceAll(host, 'example.palantirfoundry.com')
    .replaceAll(/ri\.[a-z0-9-]+\.[\w.-]*/gu, (rid) =>
      rid.startsWith(modelRid) ? rid : 'ri.redacted',
    )
    .replaceAll(
      /"(errorInstanceId|request_id|requestId|trace_id|traceId)":"[^"]*"/gu,
      '"$1":"00000000-0000-0000-0000-000000000000"',
    );
