import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { type Tool, tool } from 'ai';
import { z } from 'zod';
import type { FoundryCallOptions } from '../../middleware.js';
import { resolveModelRid } from '../../models/catalog.js';
import { isKnownOpenAIReasoningTarget } from '../../models/openai-models.js';
import type { LiveProvider } from './live-capabilities.js';

export type ProviderOptionMode =
  | 'baseline'
  | 'reasoning'
  | 'structured'
  | 'tools'
  | 'structured-tools';

// A capability survey should leave room for reasoning and final output.
export const LIVE_MAX_OUTPUT_TOKENS = 8192;

export const signalSchema = z.object({
  indication: z.string().min(1),
  mechanismOfAction: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  rationale: z.string().min(1),
});

export const expectedSignal = {
  indication: 'relapse prevention',
  mechanismOfAction: 'not specified',
  riskLevel: 'medium',
  rationale: 'liver enzyme monitoring required',
} as const;

export const structuredToolSchema = z.object({
  status: z.string().min(1),
  summary: z.string().min(1),
});

export const regulatorySignalTool: Tool<{ topic: string }, { status: string; topic: string }> =
  tool({
    description: 'Returns a deterministic regulatory status for testing tool loops.',
    inputSchema: z.object({
      topic: z.string().min(1),
    }),
    execute: async ({ topic }) => ({
      status: 'verified',
      topic,
    }),
  });

export function createMessageHistoryFixture() {
  return [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'The tracking label is blue signal.' }],
    },
    {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'Understood. I will use that tracking label.' }],
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Using only the conversation above, reply with exactly "TRACKING: blue signal" and nothing else.',
        },
      ],
    },
  ];
}

export function getStructuredOutputPrompt() {
  return `Return a JSON object by copying these supplied field values exactly, without inventing clinical details: ${JSON.stringify(expectedSignal)}`;
}

export function getStructuredToolsPrompt() {
  return 'Call the regulatorySignal tool exactly once with topic "oncology". Do not infer the status from the topic. Use the returned tool status value verbatim. Return only a JSON object with "status" equal to that exact tool status and "summary" equal to one short sentence mentioning oncology and that exact status.';
}

export function createGoogleProxyFetch(token: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);

    headers.delete('x-goog-api-key');
    headers.set('Authorization', `Bearer ${token}`);

    return fetch(new Request(request, { headers }));
  };
}

export function getProviderOptions(
  provider: LiveProvider,
  mode: ProviderOptionMode,
  modelId?: string,
): FoundryCallOptions['providerOptions'] {
  if (provider === 'xai') {
    return { xai: { store: false } };
  }

  if (provider === 'openai') {
    return getOpenAIProviderOptions(mode, modelId);
  }

  if (provider === 'anthropic') {
    if (mode === 'reasoning') {
      return {
        anthropic: {
          thinking: usesAdaptiveThinking(modelId)
            ? { type: 'adaptive', display: 'summarized' }
            : { type: 'enabled', budgetTokens: 1024 },
          ...(usesAdaptiveThinking(modelId) ? { effort: 'high' } : {}),
          sendReasoning: true,
        },
      };
    }

    if (mode === 'tools' || mode === 'structured-tools') {
      return {
        anthropic: {
          disableParallelToolUse: true,
        },
      };
    }

    return undefined;
  }

  return undefined;
}

export function getReasoningExpectation(
  provider: LiveProvider,
  modelId: string,
  defaultModelId: string,
) {
  if (provider === 'google' || provider === 'third-party' || provider === 'xai') {
    return 'investigate' as const;
  }

  if (modelId === defaultModelId) {
    return 'must-pass' as const;
  }

  return 'investigate' as const;
}

export function resolveModelIdForRidCheck(_provider: LiveProvider, modelId: string) {
  return resolveModelRid(modelId as never);
}

export function resolveVisionModelId(
  _provider: LiveProvider,
  modelId: string,
  defaultModelId: string,
  visionModelId?: string,
) {
  if (modelId === defaultModelId) {
    return visionModelId ?? modelId;
  }

  return modelId;
}

export async function collectStreamSummary(result: {
  finishReason?: PromiseLike<string> | string;
  fullStream: AsyncIterable<Record<string, unknown>>;
  output?: PromiseLike<unknown>;
  usage?: PromiseLike<unknown>;
  warnings?: PromiseLike<unknown>;
}) {
  const eventCounts: Record<string, number> = {};
  let reasoningText = '';
  let text = '';

  for await (const part of result.fullStream) {
    const type = typeof part.type === 'string' ? part.type : 'unknown';
    eventCounts[type] = (eventCounts[type] ?? 0) + 1;

    if (type === 'error') {
      throw part.error;
    }

    if (type === 'text-delta' && typeof part.text === 'string') {
      text += part.text;
    }

    if (type === 'reasoning-delta' && typeof part.text === 'string') {
      reasoningText += part.text;
    }
  }

  return {
    eventCounts,
    finishReason: await result.finishReason,
    output: result.output ? await result.output : undefined,
    reasoningText,
    text,
    usage: result.usage ? await result.usage : undefined,
    warnings: result.warnings ? await result.warnings : undefined,
  };
}

function getOpenAIProviderOptions(mode: ProviderOptionMode, modelId?: string) {
  const textVerbosity = requiresMediumOpenAITextVerbosity(modelId) ? 'medium' : 'low';
  const reasoningEffort = getOpenAIReasoningEffort(mode, modelId);
  const options: OpenAILanguageModelResponsesOptions = {
    textVerbosity,
  };

  if (reasoningEffort) {
    options.reasoningEffort = reasoningEffort;
  }

  if (mode === 'reasoning') {
    options.forceReasoning = true;
  }

  return {
    openai: options,
  };
}

function getOpenAIReasoningEffort(mode: ProviderOptionMode, modelId?: string) {
  if (modelId == null) {
    return mode === 'reasoning' ? 'low' : 'minimal';
  }

  if (supportsExplicitLowReasoningEffort(modelId)) {
    return 'low';
  }

  if (supportsMinimalReasoningEffort(modelId)) {
    return mode === 'reasoning' ? 'low' : 'minimal';
  }

  return undefined;
}

function requiresMediumOpenAITextVerbosity(modelId?: string) {
  if (modelId == null) {
    return false;
  }

  return [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-5-codex',
    'gpt-5.1-codex',
    'gpt-5.1-codex-mini',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'o3',
    'o4-mini',
  ].includes(modelId);
}

function supportsExplicitLowReasoningEffort(modelId: string) {
  return ['gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'o3', 'o4-mini'].includes(modelId);
}

function supportsMinimalReasoningEffort(modelId: string) {
  return ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'].includes(modelId);
}

export function shouldAssertOpenAIReasoning(modelId: string) {
  return isKnownOpenAIReasoningTarget(modelId);
}

export function hasReasoningEvidence(summary: {
  eventCounts: Record<string, number>;
  usage?: unknown;
}) {
  if (
    ['reasoning-start', 'reasoning-delta', 'reasoning-end'].some(
      (type) => (summary.eventCounts[type] ?? 0) > 0,
    )
  )
    return true;
  const usage = summary.usage as
    | {
        outputTokenDetails?: { reasoningTokens?: number };
        reasoningTokens?: number;
      }
    | undefined;
  return (usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens ?? 0) > 0;
}

export function usesAdaptiveThinking(modelId?: string) {
  return (
    modelId?.endsWith('-5') === true ||
    modelId === 'claude-opus-4.7' ||
    modelId === 'claude-opus-4.8' ||
    // The proxy rejects budget-based thinking for Opus 5.5 with HTTP 400.
    modelId === 'claude-opus-5.5'
  );
}
