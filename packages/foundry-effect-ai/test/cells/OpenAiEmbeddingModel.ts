import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as EmbeddingModel from 'effect/ai/EmbeddingModel';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as OpenAiEmbeddingModel from '../../src/OpenAiEmbeddingModel.ts';
import type { Cell, Env } from '../harness.ts';

const url = 'https://example.palantirfoundry.com/api/v2/llm/proxy/openai/v1/embeddings';

const withModel =
  (env: Env, model: ReturnType<typeof OpenAiEmbeddingModel.model>) =>
  <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
    Effect.provide(effect, Layer.provide(model, env.client()));

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

// Each catalog model through `embed`. ada-002 runs at its native size, which is not sent because
// Foundry rejects `dimensions` for it; the text-embedding-3 models shorten to keep fixtures small.
const catalog = [
  { model: OpenAiEmbeddingModel.model('text-embedding-ada-002'), size: 1536 },
  { model: OpenAiEmbeddingModel.model('text-embedding-3-small', { dimensions: 8 }), size: 8 },
  { model: OpenAiEmbeddingModel.model('text-embedding-3-large', { dimensions: 8 }), size: 8 },
];

export const cells: Readonly<Record<string, Cell>> = {
  embed: (env) =>
    Effect.gen(function* () {
      for (const { model, size } of catalog) {
        const [{ vector }, reported] = yield* withModel(
          env,
          model,
        )(
          Effect.all([
            EmbeddingModel.EmbeddingModel.use((service) => service.embed(text)),
            EmbeddingModel.Dimensions.useSync((dimensions) => dimensions),
          ]),
        );
        expect(vector).toHaveLength(size);
        expect(reported).toBe(size);
      }
      expectRequests(env, [
        { model: 'text-embedding-ada-002', input: [text], encoding_format: 'float' },
        { model: 'text-embedding-3-small', input: [text], encoding_format: 'float', dimensions: 8 },
        { model: 'text-embedding-3-large', input: [text], encoding_format: 'float', dimensions: 8 },
      ]);
    }),

  // Order is checked by meaning live: the repeated input lands next to its twin. Offline, a
  // synthetic response with shuffled indexes must be reordered, and a duplicate index or a vector
  // of the wrong size rejected.
  'embed-many': (env) =>
    Effect.gen(function* () {
      const embedMany = (inputs: ReadonlyArray<string>) =>
        withModel(
          env,
          OpenAiEmbeddingModel.model('text-embedding-3-large', { dimensions: 64 }),
        )(EmbeddingModel.EmbeddingModel.use((service) => service.embedMany(inputs)));
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
      expect(shuffled.embeddings.map(({ vector }) => vector)).toEqual(
        [0, 1, 2].map((value) => Array.from({ length: 64 }, () => value)),
      );
      expect(shuffled.usage.inputTokens).toBeUndefined();
      for (const _ of ['duplicate index', 'wrong size']) {
        const failure = yield* embedMany(['a', 'b']).pipe(Effect.flip, Effect.orDie);
        expect(failure.reason._tag).toBe('InvalidResponseError');
      }
      const sent = { model: 'text-embedding-3-large', encoding_format: 'float', dimensions: 64 };
      expectRequests(env, [
        { ...sent, input: inputs },
        { ...sent, input: ['a', 'b', 'c'] },
        { ...sent, input: ['a', 'b'] },
        { ...sent, input: ['a', 'b'] },
      ]);
    }),
};
