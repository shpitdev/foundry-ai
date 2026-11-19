import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import {
  APICallError,
  embed,
  generateText,
  Output,
  stepCountIs,
  streamText,
  ToolLoopAgent,
  tool,
} from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FoundryCallOptions } from '../middleware.js';
import { resolveKnownModelMetadata } from '../models/catalog.js';
import { isKnownOpenAIReasoningTarget } from '../models/openai-models.js';
import { createFoundryAnthropic } from '../providers/anthropic.js';
import { createFoundryGoogle } from '../providers/google.js';
import { createFoundryOpenAI } from '../providers/openai.js';
import { createFoundryXai } from '../providers/xai.js';
import type { ModelProvider } from '../types.js';
import {
  EMBEDDING_DIMENSIONS,
  expectedSignal,
  LIVE_MAX_OUTPUT_TOKENS,
  liveModels,
  loadLiveFoundryConfig,
  prompts,
  REASONING_ANSWER,
  RED_PNG,
  TOOL_STATUS,
} from './helpers/live.js';

type ProviderOptionMode = 'baseline' | 'reasoning' | 'tools';

const config = loadLiveFoundryConfig();
const languageModels = liveModels('language');
const embeddingModels = liveModels('embedding');
const providers = {
  openai: createFoundryOpenAI(config),
  anthropic: createFoundryAnthropic(config),
  google: createFoundryGoogle(config),
  xai: createFoundryXai(config),
};

const signalSchema = z.object({
  indication: z.string().min(1),
  mechanismOfAction: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  rationale: z.string().min(1),
});

const structuredToolSchema = z.object({
  status: z.string().min(1),
  summary: z.string().min(1),
});

const regulatorySignalTool = tool({
  description: 'Returns a deterministic regulatory status for testing tool loops.',
  inputSchema: z.object({ topic: z.string().min(1) }),
  execute: ({ topic }) => ({ status: TOOL_STATUS, topic }),
});

const executedTool = expect.arrayContaining([
  expect.objectContaining({
    toolName: 'regulatorySignal',
    output: expect.objectContaining({ status: TOOL_STATUS }),
  }),
]);

describe.skipIf(languageModels.length === 0)('language', () => {
  for (const modelId of languageModels) {
    const { provider, supportsVision } = resolveKnownModelMetadata(modelId);
    const model = () => providers[provider](modelId);
    const options = (mode: ProviderOptionMode) => getProviderOptions(provider, modelId, mode);

    it(`${provider}:${modelId}: Text`, async () => {
      const result = await generateText({
        model: model(),
        prompt: prompts.text(provider),
        maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
        providerOptions: options('baseline'),
      });

      expect(result.text.toLowerCase()).toContain(provider);
    });

    it(`${provider}:${modelId}: Stream`, async () => {
      const summary = await collectStreamSummary(
        streamText({
          model: model(),
          prompt: prompts.stream(provider),
          maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
          providerOptions: options('baseline'),
        }),
      );

      expect(summary.text.toLowerCase()).toContain('foundry');
    });

    it(`${provider}:${modelId}: JSON`, async () => {
      const result = await generateText({
        model: model(),
        output: Output.object({
          schema: signalSchema,
          name: 'clinical_signal',
          description: 'A concise clinical signal summary for regulated AI review workflows.',
        }),
        prompt: prompts.json,
        maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
        providerOptions: options('baseline'),
      });

      expect(result.output).toEqual(expectedSignal);
    });

    it(`${provider}:${modelId}: Tools`, async () => {
      const agent = new ToolLoopAgent({
        model: model(),
        maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
        tools: { regulatorySignal: regulatorySignalTool },
        providerOptions: options('tools'),
        stopWhen: stepCountIs(3),
      });
      const result = await agent.generate({ prompt: prompts.tools });

      expect(result.steps.flatMap((step) => step.toolResults)).toEqual(executedTool);
      expect(result.text).toMatch(/agent/iu);
      expect(result.text).toMatch(/verified/iu);
    });

    it(`${provider}:${modelId}: Stream tools`, async () => {
      const summary = await collectStreamSummary(
        streamText({
          model: model(),
          prompt: prompts.streamTools,
          maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
          providerOptions: options('tools'),
          stopWhen: stepCountIs(3),
          tools: { regulatorySignal: regulatorySignalTool },
        }),
      );

      expect(summary.text).toMatch(/signal/iu);
      expect(summary.text).toMatch(/verified/iu);
      expect(summary.eventCounts['tool-call']).toBeGreaterThan(0);
      expect(summary.eventCounts['tool-result']).toBeGreaterThan(0);
    });

    it(`${provider}:${modelId}: JSON + tools`, async () => {
      const result = await generateText({
        model: model(),
        output: Output.object({
          schema: structuredToolSchema,
          name: 'signal_summary',
          description: 'A structured regulatory signal summary after tool execution.',
        }),
        prompt: prompts.jsonTools,
        maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
        providerOptions: options('tools'),
        stopWhen: stepCountIs(3),
        tools: { regulatorySignal: regulatorySignalTool },
      });

      expect(result.steps.flatMap((step) => step.toolResults)).toEqual(executedTool);
      expect(result.output.status).toMatch(/verified/iu);
      expect(result.output.summary.toLowerCase()).toContain('oncology');
    });

    if (supportsVision) {
      it(`${provider}:${modelId}: Image`, async () => {
        const result = await generateText({
          model: model(),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompts.image },
                { type: 'image', image: RED_PNG, mediaType: 'image/png' },
              ],
            },
          ],
          maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
          providerOptions: options('baseline'),
        });

        expect(result.text).toMatch(/red/iu);
      });
    }

    if (provider !== 'google' && (provider !== 'openai' || isKnownOpenAIReasoningTarget(modelId))) {
      it(`${provider}:${modelId}: Reasoning`, async () => {
        const short = provider === 'anthropic' && !usesAdaptiveThinking(modelId);
        const summary = await collectStreamSummary(
          streamText({
            model: model(),
            prompt: short ? prompts.reasoningReady : prompts.reasoning,
            maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
            providerOptions: options('reasoning'),
          }),
        );

        if (provider === 'anthropic') {
          expect(summary.reasoningText.trim().length).toBeGreaterThan(0);
        } else {
          expect(hasReasoningEvidence(summary)).toBe(true);
        }

        expect(summary.text).toMatch(short ? /ready/iu : REASONING_ANSWER);
      });
    }

    if (provider === 'xai') {
      it(`${provider}:${modelId}: Chat Completions rejected`, async () => {
        await expect(
          generateText({
            model: providers.xai.chat(modelId),
            prompt: prompts.xaiChat,
            maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS,
          }),
        ).rejects.toSatisfy((error) => APICallError.isInstance(error) && error.statusCode === 400);
      });
    }
  }
});

describe.skipIf(embeddingModels.length === 0)('embeddings', () => {
  for (const modelId of embeddingModels) {
    it(`openai:${modelId}: Embedding`, async () => {
      const result = await embed({
        model: providers.openai.embeddingModel(modelId),
        value: prompts.embedding,
      });

      expect(result.embedding).toHaveLength(EMBEDDING_DIMENSIONS[modelId]);
    });
  }
});

function getProviderOptions(
  provider: ModelProvider,
  modelId: string,
  mode: ProviderOptionMode,
): FoundryCallOptions['providerOptions'] {
  if (provider === 'xai') {
    return { xai: { store: false } };
  }

  if (provider === 'openai') {
    const openai: OpenAILanguageModelResponsesOptions = {
      textVerbosity: OPENAI_MEDIUM_VERBOSITY_MODELS.has(modelId) ? 'medium' : 'low',
    };

    if (OPENAI_LOW_EFFORT_MODELS.has(modelId)) {
      openai.reasoningEffort = 'low';
    } else if (OPENAI_MINIMAL_EFFORT_MODELS.has(modelId)) {
      openai.reasoningEffort = mode === 'reasoning' ? 'low' : 'minimal';
    }

    if (mode === 'reasoning') {
      openai.forceReasoning = true;
    }

    return { openai };
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

    if (mode === 'tools') {
      return { anthropic: { disableParallelToolUse: true } };
    }
  }

  return undefined;
}

const OPENAI_MEDIUM_VERBOSITY_MODELS = new Set([
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
]);
const OPENAI_LOW_EFFORT_MODELS = new Set(['gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']);
/** Only these accept `minimal`; GPT-6 Luna and newer models reject it. */
const OPENAI_MINIMAL_EFFORT_MODELS = new Set(['gpt-5', 'gpt-5-mini', 'gpt-5-nano']);

function usesAdaptiveThinking(modelId: string) {
  return (
    modelId.endsWith('-5') ||
    [
      'claude-opus-4.7',
      'claude-opus-4.8',
      'claude-opus-5.5',
      'claude-haiku-5.5',
      'claude-sonnet-5.5',
    ].includes(modelId)
  );
}

async function collectStreamSummary(result: {
  fullStream: AsyncIterable<{ type: string } & Record<string, unknown>>;
  usage: PromiseLike<unknown>;
}) {
  const eventCounts: Record<string, number> = {};
  let reasoningText = '';
  let text = '';

  for await (const part of result.fullStream) {
    eventCounts[part.type] = (eventCounts[part.type] ?? 0) + 1;

    if (part.type === 'error') {
      throw part.error;
    }

    if (part.type === 'text-delta' && typeof part.text === 'string') {
      text += part.text;
    }

    if (part.type === 'reasoning-delta' && typeof part.text === 'string') {
      reasoningText += part.text;
    }
  }

  return { eventCounts, reasoningText, text, usage: await result.usage };
}

function hasReasoningEvidence(summary: { eventCounts: Record<string, number>; usage: unknown }) {
  if (
    ['reasoning-start', 'reasoning-delta', 'reasoning-end'].some(
      (type) => (summary.eventCounts[type] ?? 0) > 0,
    )
  ) {
    return true;
  }

  const usage = summary.usage as
    | { outputTokenDetails?: { reasoningTokens?: number }; reasoningTokens?: number }
    | undefined;

  return (usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens ?? 0) > 0;
}
