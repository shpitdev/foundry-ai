import { expect } from '@effect/vitest';
import * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Tool from 'effect/ai/Tool';
import * as Toolkit from 'effect/ai/Toolkit';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as XaiLanguageModel from '../../src/XaiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import type { Env } from '../harness.ts';

const namespace = 'foundry-xai';

/** Every replayed call needs its item ID and wire arguments. */
function expectCallReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const call = parts.find((part) => part.type === 'tool-call');
  expect(call?.metadata[namespace]).toMatchObject({
    itemId: expect.any(String),
    arguments: expect.any(String),
  });
}

/** Stateless replay on a reasoning model also needs the encrypted reasoning. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const reasoning = parts.flatMap((part) =>
    part.type === 'reasoning' || part.type === 'reasoning-end' ? [part.metadata[namespace]] : [],
  );
  expect(reasoning).toContainEqual(
    expect.objectContaining({ encryptedContent: expect.any(String) }),
  );
  expectCallReplay(parts);
}

/**
 * Grok 4.20 non-reasoning gets no reasoning settings and skips `reasoning`; Grok 4.20 reasoning
 * rejects `effort`, so it asks only for summaries.
 */
export const cellsFor = (model: string) => {
  const reasons = model !== 'grok-420-non-reasoning-latest';
  const effort = model === 'grok-420-reasoning-latest' ? {} : { effort: 'medium' as const };
  const { reasoning, ...cells } = languageCells({
    model: (options) =>
      XaiLanguageModel.model(
        model,
        options.reasoning && reasons ? { reasoning: { ...effort, summary: 'auto' } } : undefined,
      ),
    replay: reasons ? expectReplay : expectCallReplay,
  });
  return reasons && reasoning !== undefined ? { ...cells, reasoning } : cells;
};

const shared = cellsFor('grok-4-6');

const Lookup = Tool.make('lookup', {
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String,
});
const lookup = Toolkit.make(Lookup);

/**
 * Offline, against an older Foundry recording whose call has no `response.output_item.added`:
 * the completed item still opens the params block and streams the full arguments.
 */
const expectStartlessCall = (env: Env) =>
  Effect.gen(function* () {
    const parts = yield* LanguageModel.streamText({
      prompt: 'Look up oncology.',
      toolkit: lookup,
    }).pipe(
      Stream.runCollect,
      Effect.provide(
        Layer.mergeAll(
          Layer.provide(XaiLanguageModel.model('grok-420-non-reasoning-latest'), env.client()),
          lookup.toLayer({ lookup: () => Effect.succeed('verified') }),
        ),
      ),
    );
    const call = Array.from(parts).flatMap((part) =>
      'id' in part && part.id === 'call-02760d9f-d2a9-4960-bc30-51b4c9900f0a-0'
        ? [part.type === 'tool-params-delta' ? part.delta : part.type]
        : [],
    );
    expect(call).toEqual([
      'tool-params-start',
      '{"topic":"oncology"}',
      'tool-params-end',
      'tool-call',
      'tool-result',
    ]);
  });

const sharedStreamTools = shared['stream-tools'];

export const cells = {
  ...shared,
  'stream-tools': (env: Env) =>
    Effect.andThen(
      sharedStreamTools?.(env) ?? Effect.void,
      env.live ? Effect.void : expectStartlessCall(env),
    ),
};
