/**
 * Shared language-model cells. A vendor's `cells/<Module>.ts` is `languageCells(target)`: the
 * programs, prompts and assertions are the same for every vendor, and the vendor's recorded
 * fixtures pin its wire format through their golden requests. Frozen from phase 2: later
 * phases add fixtures and a target, not programs.
 */
import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as Prompt from 'effect/ai/Prompt';
import type * as Response from 'effect/ai/Response';
import * as Tool from 'effect/ai/Tool';
import * as Toolkit from 'effect/ai/Toolkit';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import type * as FoundryClient from '../src/FoundryClient.ts';
import type { Cell, Env } from './harness.ts';

export interface LanguageTarget {
  /** The model under test. `reasoning` asks for visible reasoning (summaries, thinking). */
  readonly model: (options: {
    readonly reasoning: boolean;
  }) => Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient.FoundryClient>;
}

const GetWeather = Tool.make('GetWeather', {
  description: 'Get the current weather in a city',
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.Struct({ temperatureC: Schema.Finite, conditions: Schema.String }),
});
const toolkit = Toolkit.make(GetWeather);
const handlers = toolkit.toLayer({
  GetWeather: () => Effect.succeed({ temperatureC: 21, conditions: 'sunny' }),
});

const hello = 'Reply with exactly one word: hello';
// Naming the city takes a reasoning step, so reasoning models usually think before the call.
const weather =
  'Before calling any tool, work out which European capital hosted the Summer Olympics in 1900 and 1924. Then call the GetWeather tool for it and answer in one sentence.';
// Enough to reason about, so models reliably report reasoning.
const puzzle =
  'A bat and a ball cost 110 cents in total. The bat costs 100 cents more than the ball. How many cents does the ball cost? Reason step by step, then answer with just the number.';
// 128x128 solid red PNG.
const redPng =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAxElEQVR42u3RMQ0AAAjAsPk3DTLgaDIFa1M6zAIAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABAADAAgAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAjAixYgaMOy89oM6gAAAABJRU5ErkJggg==';

const Capital = Schema.Struct({ city: Schema.String, country: Schema.String });
const Report = Schema.Struct({ city: Schema.String, temperatureC: Schema.Finite });

const using =
  (target: LanguageTarget, env: Env, reasoning = false) =>
  <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
    Effect.provide(
      effect,
      Layer.mergeAll(Layer.provide(target.model({ reasoning }), env.client()), handlers),
    );

const collect = <E, R>(stream: Stream.Stream<Response.AnyPart, E, R>) =>
  Effect.map(Stream.runCollect(stream), (parts) => Array.from(parts));

const textOf = (parts: ReadonlyArray<Response.AnyPart>) =>
  parts.flatMap((part) => (part.type === 'text-delta' ? [part.delta] : [])).join('');

const finishOf = (parts: ReadonlyArray<Response.AnyPart>) =>
  parts.flatMap((part) => (part.type === 'finish' ? [part.reason] : []));

/** The error a stream must fail with; finishing is a defect. */
const streamFailure = <R>(stream: Stream.Stream<Response.AnyPart, AiError.AiError, R>) =>
  Effect.orDie(Effect.flip(Stream.runDrain(stream)));

export const languageCells = (target: LanguageTarget): Readonly<Record<string, Cell>> => ({
  text: (env) =>
    Effect.gen(function* () {
      const response = yield* using(target, env)(LanguageModel.generateText({ prompt: hello }));
      expect(response.text).toMatch(/hello/iu);
      expect(response.finishReason).toBe('stop');
      expect(response.usage.inputTokens.total).toBeGreaterThan(0);
    }),

  stream: (env) =>
    Effect.gen(function* () {
      const parts = yield* using(target, env)(collect(LanguageModel.streamText({ prompt: hello })));
      expect(textOf(parts)).toMatch(/hello/iu);
      expect(finishOf(parts)).toEqual(['stop']);
    }),

  json: (env) =>
    Effect.gen(function* () {
      const response = yield* using(
        target,
        env,
      )(
        LanguageModel.generateObject({
          prompt: 'Name the capital of France and its country.',
          schema: Capital,
        }),
      );
      expect(response.value).toEqual({ city: 'Paris', country: 'France' });
    }),

  // Two requests with reasoning on: the tool call, then the result and the answer. The second
  // request replays the first turn's reasoning, which is where stateless Foundry differs most.
  tools: (env) =>
    Effect.gen(function* () {
      const run = using(target, env, true);
      const first = yield* run(LanguageModel.generateText({ prompt: weather, toolkit }));
      expect(first.toolCalls.map((call) => call.name)).toEqual(['GetWeather']);
      expect(first.toolResults).toHaveLength(1);
      expect(first.finishReason).toBe('tool-calls');
      const prompt = Prompt.concat(Prompt.make(weather), Prompt.fromResponseParts(first.content));
      const second = yield* run(LanguageModel.generateText({ prompt, toolkit }));
      expect(second.text).toMatch(/21/u);
      expect(second.finishReason).toBe('stop');
    }),

  'stream-tools': (env) =>
    Effect.gen(function* () {
      const parts = yield* using(
        target,
        env,
      )(collect(LanguageModel.streamText({ prompt: weather, toolkit })));
      const calls = parts.flatMap((part) => (part.type === 'tool-call' ? [part.name] : []));
      expect(calls).toEqual(['GetWeather']);
      expect(parts.some((part) => part.type === 'tool-result')).toBe(true);
      expect(finishOf(parts)).toEqual(['tool-calls']);
    }),

  // JSON output with a tool, over two requests as an AI SDK `stopWhen` loop would make them.
  'json-tools': (env) =>
    Effect.gen(function* () {
      const run = using(target, env);
      const prompt = `${weather} Report the city and temperature.`;
      const first = yield* run(
        LanguageModel.generateObject({ prompt, schema: Report, toolkit, allowEmpty: true }),
      );
      expect(first.toolCalls.map((call) => call.name)).toEqual(['GetWeather']);
      expect(Option.isNone(first.value)).toBe(true);
      const second = yield* run(
        LanguageModel.generateObject({
          prompt: Prompt.concat(Prompt.make(prompt), Prompt.fromResponseParts(first.content)),
          schema: Report,
          toolkit,
        }),
      );
      expect(second.value).toEqual({ city: 'Paris', temperatureC: 21 });
    }),

  image: (env) =>
    Effect.gen(function* () {
      const response = yield* using(
        target,
        env,
      )(
        LanguageModel.generateText({
          prompt: Prompt.make([
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What color fills this image? Answer with one word.' },
                { type: 'file', mediaType: 'image/png', data: redPng },
              ],
            },
          ]),
        }),
      );
      expect(response.text).toMatch(/red/iu);
    }),

  // Streamed, so the fixture records the vendor's reasoning events.
  reasoning: (env) =>
    Effect.gen(function* () {
      const parts = yield* using(
        target,
        env,
        true,
      )(collect(LanguageModel.streamText({ prompt: puzzle })));
      const reasoning = parts.flatMap((part) =>
        part.type === 'reasoning-delta' ? [part.delta] : [],
      );
      expect(reasoning.join('').length).toBeGreaterThan(0);
      expect(textOf(parts)).toMatch(/\b5\b/u);
      expect(finishOf(parts)).toEqual(['stop']);
    }),

  // Synthetic: a recorded `stream` fixture cut before its terminal event.
  'stream-truncated': (env) =>
    Effect.gen(function* () {
      const error = yield* using(
        target,
        env,
      )(streamFailure(LanguageModel.streamText({ prompt: hello })));
      expect(error.reason._tag).toBe('InvalidResponseError');
    }),

  // Synthetic: the vendor's in-band error event fails the stream instead of finishing it.
  'stream-error': (env) =>
    Effect.gen(function* () {
      const error = yield* using(
        target,
        env,
      )(streamFailure(LanguageModel.streamText({ prompt: hello })));
      expect(error.reason._tag).toBe('InternalProviderError');
    }),
});
