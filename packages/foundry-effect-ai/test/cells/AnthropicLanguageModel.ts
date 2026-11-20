import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as AnthropicLanguageModel from '../../src/AnthropicLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import type { Env } from '../harness.ts';

const namespace = 'foundry-anthropic';

/** Thinking replays only with its signature, ahead of the call. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const reasoning = parts.flatMap((part) =>
    part.type === 'reasoning' || part.type === 'reasoning-end' ? [part.metadata[namespace]] : [],
  );
  expect(reasoning).toContainEqual(expect.objectContaining({ signature: expect.any(String) }));
}

// Claude Haiku 4.5 predates adaptive thinking, so reasoning cells set a thinking budget.
const shared = languageCells({
  model: ({ reasoning }) =>
    AnthropicLanguageModel.model(
      'claude-haiku-4.5',
      reasoning ? { thinking: { type: 'enabled', budget_tokens: 1024 } } : undefined,
    ),
  replay: expectReplay,
});

// Claude Sonnet 5.5 rejects forced tool use and budget thinking: the shared `json` program runs
// with native `output_config.format` and adaptive thinking.
const nativeJson = languageCells({
  model: () =>
    AnthropicLanguageModel.model('claude-sonnet-5.5', { thinking: { type: 'adaptive' } }),
  replay: expectReplay,
})['json'];

export const cells = {
  ...shared,
  'json-native-claude-sonnet-5.5': (env: Env) =>
    Effect.andThen(
      nativeJson?.(env) ?? Effect.void,
      Effect.sync(() => {
        if (!env.live) {
          expect(env.requests[0]?.body).toMatchObject({
            thinking: { type: 'adaptive' },
            output_config: { format: { type: 'json_schema' } },
          });
          expect(env.requests[0]?.body).not.toHaveProperty('tool_choice');
        }
      }),
    ),
};
