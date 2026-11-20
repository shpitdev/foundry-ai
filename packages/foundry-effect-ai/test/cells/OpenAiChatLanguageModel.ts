import { expect } from '@effect/vitest';
import * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { models } from '../../src/internal/models/openai.ts';
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
const reasoningTokens = (model: string) => (env: Env) =>
  Effect.gen(function* () {
    const parts = yield* Stream.runCollect(LanguageModel.streamText({ prompt: puzzle })).pipe(
      Effect.map((collected) => Array.from(collected)),
      Effect.provide(
        Layer.provide(
          OpenAiChatLanguageModel.model(model, { reasoning_effort: 'medium' }),
          env.client(),
        ),
      ),
    );
    const text = parts.flatMap((part) => (part.type === 'text-delta' ? [part.delta] : []));
    expect(text.join('')).toMatch(/\b5\b/u);
    const finish = parts.find((part) => part.type === 'finish');
    expect(finish?.reason).toBe('stop');
    expect(finish?.usage.outputTokens.reasoning).toBeGreaterThan(0);
  });

const known: Readonly<Record<string, { readonly rid: string; readonly reasoning?: boolean }>> =
  models;

// No visible reasoning to ask for, and gpt-6-luna takes tools here only without reasoning.
// Models the catalog does not mark as reasoning skip `reasoning`.
export const cellsFor = (model: string) => {
  const { reasoning: _, ...cells } = languageCells({
    model: () => OpenAiChatLanguageModel.model(model),
    replay: expectReplay,
  });
  return known[model]?.reasoning === true ? { ...cells, reasoning: reasoningTokens(model) } : cells;
};

const shared = cellsFor('gpt-6-luna');
const sharedTruncated = shared['stream-truncated'] ?? (() => Effect.void);

export const cells = {
  ...shared,
  // Two cuts, since Foundry sends no `[DONE]`: before the finish reason, and between it and the
  // usage chunk that ends the stream.
  'stream-truncated': (env: Env) => Effect.andThen(sharedTruncated(env), sharedTruncated(env)),
};
