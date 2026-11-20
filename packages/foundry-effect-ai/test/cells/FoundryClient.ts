import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as FoundryClient from '../../src/FoundryClient.ts';
import type { Cell } from '../harness.ts';

const rid = (name: string) => `ri.language-model-service..language-model.${name}`;
const unknownModel = rid('does-not-exist');
const hi = 'Say hi.';

// One minimal request per vendor route. Neither probe reaches a model: Foundry rejects the bad
// token and the unknown model itself.
const routes = [
  {
    path: () => '/openai/v1/responses',
    body: (model: string) => ({ model, input: hi, store: false }),
    model: rid('gpt-6-luna'),
  },
  {
    path: () => '/anthropic/v1/messages',
    body: (model: string) => ({ model, max_tokens: 16, messages: [{ role: 'user', content: hi }] }),
    model: rid('anthropic-claude-4-5-haiku'),
  },
  {
    path: (model: string) => `/google/v1/models/${model}:generateContent`,
    body: () => ({ contents: [{ role: 'user', parts: [{ text: hi }] }] }),
    model: rid('gemini-3-1-flash-lite'),
  },
  {
    path: () => '/xai/v1/responses',
    body: (model: string) => ({ model, input: hi, store: false }),
    model: rid('grok-4-6'),
  },
] as const;

const fail = (
  layer: Layer.Layer<FoundryClient.FoundryClient>,
  path: string,
  body: unknown,
): Effect.Effect<AiError.AiErrorReason> =>
  FoundryClient.FoundryClient.use((client) =>
    client.json({ path, body, schema: Schema.Struct({ id: Schema.String }) }),
  ).pipe(
    Effect.provide(layer),
    Effect.flip,
    Effect.orDie,
    Effect.map((error) => error.reason),
  );

export const cells: Readonly<Record<string, Cell>> = {
  'error-mapping': (env) =>
    Effect.gen(function* () {
      for (const route of routes) {
        const unauthorized = yield* fail(
          env.client({ token: Redacted.make('invalid-token') }),
          route.path(route.model),
          route.body(route.model),
        );
        expect(unauthorized).toMatchObject({
          _tag: 'AuthenticationError',
          kind: 'InvalidKey',
          metadata: { foundry: { errorName: 'Default:Unauthorized' } },
        });
        const notAvailable = yield* fail(
          env.client(),
          route.path(unknownModel),
          route.body(unknownModel),
        );
        expect(notAvailable).toMatchObject({
          _tag: 'InvalidRequestError',
          metadata: { foundry: { errorName: 'LanguageModelService:LanguageModelNotAvailable' } },
        });
        expect(notAvailable.message).toContain('Unable to use model: unknown language model');
      }
      if (env.live) {
        return;
      }

      const [unauthorized, notAvailable] = env.requests;
      expect(unauthorized).toMatchObject({
        method: 'POST',
        url: 'https://example.palantirfoundry.com/api/v2/llm/proxy/openai/v1/responses',
        headers: {
          authorization: 'Bearer invalid-token',
          attribution: 'ri.attribution.main',
          traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: { model: rid('gpt-6-luna'), input: hi, store: false },
      });
      expect(notAvailable?.headers['authorization']).toBe('Bearer token-123');
      expect(env.requests[5]?.url).toBe(
        `https://example.palantirfoundry.com/api/v2/llm/proxy/google/v1/models/${unknownModel}:generateContent`,
      );

      // Synthetic: responses Foundry does not produce on demand.
      const client = env.client();
      const path = '/openai/v1/responses';
      expect(yield* fail(client, path, {})).toMatchObject({
        _tag: 'RateLimitError',
        retryAfter: Duration.seconds(7),
      });
      expect(yield* fail(client, path, {})).toMatchObject({ _tag: 'InternalProviderError' });
      expect(yield* fail(client, path, {})).toMatchObject({ _tag: 'InvalidResponseError' });
      expect(yield* fail(client, path, {})).toMatchObject({ _tag: 'InvalidResponseError' });
    }),
};
