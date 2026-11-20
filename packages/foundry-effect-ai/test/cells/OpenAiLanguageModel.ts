import { expect } from '@effect/vitest';
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as Prompt from 'effect/ai/Prompt';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as OpenAiLanguageModel from '../../src/OpenAiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import type { Env } from '../harness.ts';

const namespace = 'foundry-openai';

/** Stateless replay needs encrypted reasoning and the call's item ID and wire arguments. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const reasoning = parts.flatMap((part) =>
    part.type === 'reasoning' || part.type === 'reasoning-end' ? [part.metadata[namespace]] : [],
  );
  expect(reasoning).toContainEqual(
    expect.objectContaining({ encryptedContent: expect.any(String) }),
  );
  const call = parts.find((part) => part.type === 'tool-call');
  expect(call?.metadata[namespace]).toMatchObject({
    itemId: expect.any(String),
    arguments: expect.any(String),
  });
}

const shared = languageCells({
  model: ({ reasoning }) =>
    OpenAiLanguageModel.model(
      'gpt-6-luna',
      reasoning ? { reasoning: { effort: 'medium', summary: 'auto' } } : undefined,
    ),
  replay: expectReplay,
});

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
