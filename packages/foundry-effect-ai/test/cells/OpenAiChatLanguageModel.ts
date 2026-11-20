import { expect } from '@effect/vitest';
import * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import * as OpenAiChatLanguageModel from '../../src/OpenAiChatLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import type { Env } from '../harness.ts';

const namespace = 'foundry-openai';

/** Chat replays a call by its ID with the model's own argument text; it has no reasoning. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const call = parts.find((part) => part.type === 'tool-call');
  expect(call?.metadata[namespace]).toMatchObject({ arguments: expect.any(String) });
}

const puzzle =
  'A bat and a ball cost 110 cents in total. The bat costs 100 cents more than the ball. How many cents does the ball cost? Reason step by step, then answer with just the number.';

/**
 * Foundry's Chat Completions returns no reasoning text for OpenAI models (`reasoning_content`
 * is always null), so the shared cell's reasoning deltas cannot exist. The model still
 * reasons: usage reports reasoning tokens, and the answer streams as usual.
 */
const reasoningTokens = (env: Env) =>
  Effect.gen(function* () {
    const model = OpenAiChatLanguageModel.model('gpt-6-luna', { reasoning_effort: 'medium' });
    const parts = yield* Stream.runCollect(LanguageModel.streamText({ prompt: puzzle })).pipe(
      Effect.map((collected) => Array.from(collected)),
      Effect.provide(Layer.provide(model, env.client())),
    );
    const text = parts.flatMap((part) => (part.type === 'text-delta' ? [part.delta] : []));
    expect(text.join('')).toMatch(/\b5\b/u);
    const finish = parts.find((part) => part.type === 'finish');
    expect(finish?.reason).toBe('stop');
    expect(finish?.usage.outputTokens.reasoning).toBeGreaterThan(0);
  });

// No visible reasoning to ask for, and gpt-6-luna takes tools here only without reasoning.
const shared = languageCells({
  model: () => OpenAiChatLanguageModel.model('gpt-6-luna'),
  replay: expectReplay,
});
const sharedTruncated = shared['stream-truncated'] ?? (() => Effect.void);

export const cells = {
  ...shared,
  reasoning: reasoningTokens,
  // Two cuts, since Foundry sends no `[DONE]`: before the finish reason, and between it and the
  // usage chunk that ends the stream.
  'stream-truncated': (env: Env) => Effect.andThen(sharedTruncated(env), sharedTruncated(env)),
};
