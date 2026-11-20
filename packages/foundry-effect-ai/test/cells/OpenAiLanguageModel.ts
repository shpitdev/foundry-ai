import { expect } from '@effect/vitest';
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as Prompt from 'effect/ai/Prompt';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { models } from '../../src/internal/models/openai.ts';
import * as OpenAiLanguageModel from '../../src/OpenAiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import type { Env } from '../harness.ts';

const namespace = 'foundry-openai';

const known: Readonly<Record<string, { readonly rid: string; readonly reasoning?: boolean }>> =
  models;

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

/** Models the catalog does not mark as reasoning get no reasoning settings and skip `reasoning`. */
export const cellsFor = (model: string) => {
  const reasons = known[model]?.reasoning === true;
  const { reasoning, ...cells } = languageCells({
    model: (options) =>
      OpenAiLanguageModel.model(
        model,
        options.reasoning && reasons
          ? { reasoning: { effort: 'medium', summary: 'auto' } }
          : undefined,
      ),
    replay: reasons ? expectReplay : expectCallReplay,
  });
  return reasons && reasoning !== undefined ? { ...cells, reasoning } : cells;
};

const shared = cellsFor('gpt-6-luna');

const voidResult = Prompt.make([
  { role: 'user', content: 'Log the visit.' },
  {
    role: 'assistant',
    content: [{ type: 'tool-call', id: 'call_void', name: 'LogVisit', params: {} }],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        id: 'call_void',
        name: 'LogVisit',
        result: undefined,
        isFailure: false,
      },
    ],
  },
]);

/** Offline, against a synthetic reply: a void tool result still sends an `output` string. */
const expectVoidOutput = (env: Env) =>
  Effect.gen(function* () {
    yield* LanguageModel.generateText({ prompt: voidResult }).pipe(
      Effect.provide(Layer.provide(OpenAiLanguageModel.model('gpt-6-luna'), env.client())),
    );
    expect(env.requests.at(-1)?.body).toMatchObject({
      input: expect.arrayContaining([
        { type: 'function_call_output', call_id: 'call_void', output: 'null' },
      ]),
    });
  });

const sharedTools = shared['tools'];

export const cells = {
  ...shared,
  tools: (env: Env) =>
    Effect.andThen(
      sharedTools?.(env) ?? Effect.void,
      env.live ? Effect.void : expectVoidOutput(env),
    ),
};
