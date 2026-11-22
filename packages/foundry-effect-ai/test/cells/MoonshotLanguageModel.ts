import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as MoonshotLanguageModel from '../../src/MoonshotLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import { expectChatReplay, twoCuts } from '../chat.ts';
import type { Cell, Env } from '../harness.ts';

/**
 * Kimi reasons by default. Replay needs the call's argument text and none of the reasoning. With
 * `required`, as for the recorded default, the first turn must reason, so a recording without
 * reasoning cannot stand in for the replay fixture.
 */
const expectReplay =
  (required: boolean) =>
  (parts: ReadonlyArray<Response.AnyPart>): void => {
    expectChatReplay(MoonshotLanguageModel.providerName)(parts);
    if (required) {
      const reasoning = parts.flatMap((part) => {
        if (part.type === 'reasoning') {
          return [part.text];
        }
        return part.type === 'reasoning-delta' ? [part.delta] : [];
      });
      expect(reasoning.join('')).not.toBe('');
    }
  };

export const cellsFor = (model: string, recorded = false) =>
  languageCells({
    model: () => MoonshotLanguageModel.model(model),
    replay: expectReplay(recorded),
  });

/**
 * Offline, the replayed turn carries the assistant's tool call but no `reasoning_content`, which
 * Foundry rejects on assistant messages (HTTP 400). Live, the second request succeeding shows it.
 */
const withoutReasoningContent =
  (cell: Cell | undefined): Cell =>
  (env: Env) =>
    Effect.andThen(
      cell?.(env) ?? Effect.void,
      Effect.sync(() => {
        if (!env.live) {
          const replay = env.requests[1]?.body;
          expect(replay).toMatchObject({
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
            ]),
          });
          const messages =
            Predicate.hasProperty(replay, 'messages') && Array.isArray(replay.messages)
              ? replay.messages
              : [];
          for (const message of messages) {
            expect(message).not.toHaveProperty('reasoning_content');
          }
        }
      }),
    );

const shared = cellsFor('kimi-k3.1-pro-highspeed', true);

export const cells = {
  ...shared,
  tools: withoutReasoningContent(shared['tools']),
  'stream-tools': withoutReasoningContent(shared['stream-tools']),
  'stream-truncated': twoCuts(shared['stream-truncated']),
};
