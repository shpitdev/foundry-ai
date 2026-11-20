import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as AnthropicLanguageModel from '../../src/AnthropicLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import type { Env } from '../harness.ts';

const namespace = 'foundry-anthropic';

/**
 * Thinking replays only with its signature, ahead of the call. With `required`, as for the
 * recorded defaults, the turn must think; adaptive models may answer without thinking, so a
 * sweep checks signatures only where the model thought.
 */
const expectReplay =
  (required: boolean) =>
  (parts: ReadonlyArray<Response.AnyPart>): void => {
    const reasoning = parts.flatMap((part) =>
      part.type === 'reasoning' || part.type === 'reasoning-end' ? [part.metadata[namespace]] : [],
    );
    if (required || reasoning.length > 0) {
      expect(reasoning).toContainEqual(expect.objectContaining({ signature: expect.any(String) }));
    }
  };

// Opus 4.7 and 4.8, Claude 5 and Claude 5.5 take only adaptive thinking, and show its text only
// when asked. Older models, such as Claude Haiku 4.5, take a thinking budget.
const adaptive = new Set([
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-5.5',
  'claude-sonnet-5.5',
  'claude-opus-5.5',
]);

export const cellsFor = (model: string, recorded = false) =>
  languageCells({
    model: ({ reasoning }) =>
      AnthropicLanguageModel.model(
        model,
        reasoning
          ? {
              thinking: adaptive.has(model)
                ? { type: 'adaptive', display: 'summarized' }
                : { type: 'enabled', budget_tokens: 1024 },
            }
          : undefined,
      ),
    replay: expectReplay(recorded),
  });

const shared = cellsFor('claude-haiku-4.5', true);

// Claude Sonnet 5.5 rejects forced tool use and budget thinking: the shared `json` program runs
// with native `output_config.format` and adaptive thinking.
const nativeJson = languageCells({
  model: () =>
    AnthropicLanguageModel.model('claude-sonnet-5.5', { thinking: { type: 'adaptive' } }),
  replay: expectReplay(true),
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
