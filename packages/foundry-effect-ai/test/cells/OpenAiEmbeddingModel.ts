import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as EmbeddingModel from 'effect/ai/EmbeddingModel';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as OpenAiEmbeddingModel from '../../src/OpenAiEmbeddingModel.ts';
import type { Cell, Env } from '../harness.ts';

const url = 'https://example.palantirfoundry.com/api/v2/llm/proxy/openai/v1/embeddings';

const withModel =
  (env: Env, id: OpenAiEmbeddingModel.ModelId, dimensions: number) =>
  <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
    Effect.provide(
      effect,
      Layer.provide(OpenAiEmbeddingModel.model(id, { dimensions }), env.client()),
    );

/** The embeddings requests a cell sent, in order. */
const expectRequests = (env: Env, bodies: ReadonlyArray<object>) => {
  if (!env.live) {
    expect(env.requests.map((request) => ({ url: request.url, body: request.body }))).toEqual(
      bodies.map((body) => ({ url, body })),
    );
  }
};

const dot = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

const cosine = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));

const text = 'My order arrived with a cracked screen.';

// Each catalog model through `embed`. Foundry rejects `dimensions` for ada-002, so its native
// size is not sent; the text-embedding-3 models shorten to keep the fixtures small.
const catalog = [
  { id: 'text-embedding-ada-002', dimensions: 1536 },
  { id: 'text-embedding-3-small', dimensions: 8 },
  { id: 'text-embedding-3-large', dimensions: 8 },
] as const;

export const cells: Readonly<Record<string, Cell>> = {
  embed: (env) =>
    Effect.gen(function* () {
      for (const { id, dimensions } of catalog) {
        const [{ vector }, reported] = yield* withModel(
          env,
          id,
          dimensions,
        )(
          Effect.all([
            EmbeddingModel.EmbeddingModel.use((model) => model.embed(text)),
            EmbeddingModel.Dimensions.useSync((size) => size),
          ]),
        );
        expect(vector).toHaveLength(dimensions);
        expect(reported).toBe(dimensions);
      }
      expectRequests(env, [
        { model: 'text-embedding-ada-002', input: [text], encoding_format: 'float' },
        { model: 'text-embedding-3-small', input: [text], encoding_format: 'float', dimensions: 8 },
        { model: 'text-embedding-3-large', input: [text], encoding_format: 'float', dimensions: 8 },
      ]);
    }),

  // Order is checked by meaning live: the repeated input lands next to its twin. Offline, a
  // synthetic response with shuffled indexes must be reordered, and a duplicate index rejected.
  'embed-many': (env) =>
    Effect.gen(function* () {
      const embedMany = (inputs: ReadonlyArray<string>) =>
        withModel(
          env,
          'text-embedding-3-large',
          64,
        )(EmbeddingModel.EmbeddingModel.use((model) => model.embedMany(inputs)));
      const inputs = [text, 'Quarterly revenue grew by four percent.', text];
      const { embeddings, usage } = yield* embedMany(inputs);
      const [first, other, repeat] = embeddings.map(({ vector }) => vector);
      expect(first).toHaveLength(64);
      expect(cosine(first ?? [], repeat ?? [])).toBeGreaterThan(0.99);
      expect(cosine(first ?? [], other ?? [])).toBeLessThan(0.8);
      expect(usage.inputTokens).toBeGreaterThan(0);
      if (env.live) {
        return;
      }

      const shuffled = yield* embedMany(['a', 'b', 'c']);
      expect(shuffled.embeddings.map(({ vector }) => vector)).toEqual([[0], [1], [2]]);
      expect(shuffled.usage.inputTokens).toBeUndefined();
      const duplicate = yield* embedMany(['a', 'b']).pipe(Effect.flip, Effect.orDie);
      expect(duplicate.reason._tag).toBe('InvalidResponseError');
      const sent = { model: 'text-embedding-3-large', encoding_format: 'float', dimensions: 64 };
      expectRequests(env, [
        { ...sent, input: inputs },
        { ...sent, input: ['a', 'b', 'c'] },
        { ...sent, input: ['a', 'b'] },
      ]);
    }),
};
