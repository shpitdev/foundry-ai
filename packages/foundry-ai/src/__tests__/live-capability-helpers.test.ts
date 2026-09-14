import { describe, expect, it } from 'vitest';
import {
  collectStreamSummary,
  getProviderOptions,
  hasReasoningEvidence,
} from './helpers/live-capability-helpers.js';

describe('live capability provider options', () => {
  it('uses budgeted thinking for pre-Claude 5 reasoning probes', () => {
    expect(getProviderOptions('anthropic', 'reasoning', 'claude-haiku-4.5')).toEqual({
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 1024,
        },
        sendReasoning: true,
      },
    });
  });

  it.each(['claude-sonnet-5', 'claude-opus-4.7', 'claude-opus-4.8'])(
    'uses adaptive thinking for %s reasoning probes',
    (modelId) => {
      expect(getProviderOptions('anthropic', 'reasoning', modelId)).toEqual({
        anthropic: {
          effort: 'high',
          thinking: {
            display: 'summarized',
            type: 'adaptive',
          },
          sendReasoning: true,
        },
      });
    },
  );

  it('keeps anthropic tool-loop options intact', () => {
    expect(getProviderOptions('anthropic', 'tools', 'claude-haiku-4.5')).toEqual({
      anthropic: {
        disableParallelToolUse: true,
      },
    });
  });
});

describe('stream failure evidence', () => {
  it('preserves stream errors instead of reporting empty text', async () => {
    const error = new Error('proxy rejected the model');
    async function* fullStream() {
      yield { type: 'error', error };
    }
    await expect(collectStreamSummary({ fullStream: fullStream() })).rejects.toBe(error);
  });
});

describe('reasoning evidence', () => {
  it('recognizes SDK 7 reasoning-token usage without reasoning stream events', () => {
    expect(
      hasReasoningEvidence({
        eventCounts: {},
        usage: { outputTokenDetails: { textTokens: 10, reasoningTokens: 128 } },
      }),
    ).toBe(true);
  });

  it('does not accept ordinary text mentioning reasoning as reasoning evidence', () => {
    const summary = {
      eventCounts: { 'text-delta': 1 },
      text: 'READY — reasoning is hidden.',
      usage: { outputTokenDetails: { textTokens: 10, reasoningTokens: 0 } },
    };
    expect(hasReasoningEvidence(summary)).toBe(false);
  });
});
