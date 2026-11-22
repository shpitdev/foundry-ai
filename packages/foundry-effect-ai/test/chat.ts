/** Checks shared by the language modules on Foundry's Chat Completions route. */
import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import type * as FoundryClient from '../src/FoundryClient.ts';
import type { Cell, Env } from './harness.ts';

/** Chat replays a call by its ID with the model's own argument text, kept under `namespace`. */
export const expectChatReplay =
  (namespace: string) =>
  (parts: ReadonlyArray<Response.AnyPart>): void => {
    const call = parts.find((part) => part.type === 'tool-call');
    expect(call?.metadata[namespace]).toMatchObject({ arguments: expect.any(String) });
  };

/**
 * Runs `stream-truncated` over two cuts, since Foundry sends no `[DONE]`: before the finish
 * reason, and between it and the usage chunk that ends the stream.
 */
export const twoCuts =
  (cell: Cell | undefined): Cell =>
  (env) =>
    cell === undefined ? Effect.void : Effect.andThen(cell(env), cell(env));

const puzzle =
  'A bat and a ball cost 110 cents in total. The bat costs 100 cents more than the ball. How many cents does the ball cost? Reason step by step, then answer with just the number.';

const Example = Schema.Struct({ example: Schema.String });

const deltas = (parts: ReadonlyArray<Response.AnyPart>, type: 'reasoning-delta' | 'text-delta') =>
  parts.flatMap((part) => (part.type === type ? [part.delta] : [])).join('');

/**
 * Synthetic: `<reasoning>` spans as DeepSeek, Nemotron and Qwen send them when asked to reason,
 * first in one message, then streamed with each tag split across deltas. Both start with an
 * empty span, give the same reasoning and answer, and keep a `<` that starts no tag; the stream
 * opens one block of each kind. With reasoning off, a literal tag in JSON or streamed text is
 * answer text, untouched.
 */
export const reasoningTags =
  (
    model: (
      reasoning: boolean,
    ) => Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient.FoundryClient>,
  ): Cell =>
  (env: Env) => {
    const using =
      (reasoning: boolean) =>
      <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
        Effect.provide(effect, Layer.provide(model(reasoning), env.client()));
    const collect = Effect.map(
      Stream.runCollect(LanguageModel.streamText({ prompt: puzzle })),
      (parts) => Array.from(parts),
    );
    return Effect.gen(function* () {
      const reasoning = 'Let the ball cost x. Then 2x + 100 = 110, so x = 5.';
      const answer = 'The ball costs 5 cents, and 5 < 10.';
      const response = yield* using(true)(LanguageModel.generateText({ prompt: puzzle }));
      expect(response.reasoningText).toBe(reasoning);
      expect(response.text).toBe(answer);
      const parts = yield* using(true)(collect);
      expect(deltas(parts, 'reasoning-delta')).toBe(reasoning);
      expect(deltas(parts, 'text-delta')).toBe(answer);
      expect(
        parts.flatMap((part) =>
          part.type.endsWith('-start') || part.type.endsWith('-end') ? [part.type] : [],
        ),
      ).toEqual(['reasoning-start', 'reasoning-end', 'text-start', 'text-end']);

      const literal = '<reasoning>visible</reasoning>';
      const object = yield* using(false)(
        LanguageModel.generateObject({
          prompt: 'Show the reasoning tag as text.',
          schema: Example,
        }),
      );
      expect(object.value).toEqual({ example: literal });
      const plain = yield* using(false)(collect);
      expect(deltas(plain, 'text-delta')).toBe(`The tag is ${literal}.`);
      expect(deltas(plain, 'reasoning-delta')).toBe('');
    });
  };
