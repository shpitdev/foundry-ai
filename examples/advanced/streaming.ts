import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { getModelMetadata, MODEL_CATALOG_BY_RID } from '@nyrra/foundry-ai';
import { streamText } from 'ai';
import { logError, logValue } from '../base/logger.js';
import { createLanguageModel } from '../base/model.js';

const ADAPTIVE_ANTHROPIC_MODELS = new Set([
  'ANTHROPIC_CLAUDE_46_OPUS',
  'ANTHROPIC_CLAUDE_46_SONNET',
  'ANTHROPIC_CLAUDE_47_OPUS',
  'ANTHROPIC_CLAUDE_48_OPUS',
  'ANTHROPIC_CLAUDE_5_OPUS',
  'ANTHROPIC_CLAUDE_5_SONNET',
]);
const SUMMARIZED_ANTHROPIC_MODELS = new Set([
  'ANTHROPIC_CLAUDE_47_OPUS',
  'ANTHROPIC_CLAUDE_48_OPUS',
  'ANTHROPIC_CLAUDE_5_OPUS',
  'ANTHROPIC_CLAUDE_5_SONNET',
]);
const { model, modelId, provider } = createLanguageModel();
const prompt =
  'Compare the tradeoffs of routing LLM calls through a corporate proxy versus calling provider APIs directly. Keep it to three bullet points.';
type ExampleProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;
const modelIdentifier = (getModelMetadata(modelId) ?? MODEL_CATALOG_BY_RID[modelId])
  ?.modelIdentifier;
const usesAdaptiveThinking =
  modelIdentifier != null && ADAPTIVE_ANTHROPIC_MODELS.has(modelIdentifier);
const usesSummarizedThinking =
  modelIdentifier != null && SUMMARIZED_ANTHROPIC_MODELS.has(modelIdentifier);

const providerOptions: ExampleProviderOptions =
  provider === 'openai'
    ? {
        openai: {
          textVerbosity: 'low',
        } satisfies OpenAILanguageModelResponsesOptions,
      }
    : provider === 'anthropic'
      ? {
          anthropic: {
            thinking: usesAdaptiveThinking
              ? {
                  type: 'adaptive',
                  ...(usesSummarizedThinking ? { display: 'summarized' as const } : {}),
                }
              : { type: 'enabled', budgetTokens: 1024 },
            ...(usesAdaptiveThinking ? { effort: 'high' } : {}),
            sendReasoning: true,
          } satisfies AnthropicLanguageModelOptions,
        }
      : {};

const result = streamText({
  model,
  prompt,
  providerOptions,
  onFinish({ text, finishReason, usage }) {
    logValue({ type: 'finish', finishReason, usage });
    logValue({ type: 'final-text', text });
  },
  onError({ error }) {
    logError({ type: 'error', error });
  },
});

console.log(`provider: ${provider}`);
console.log(`model: ${modelId}`);
logValue({ type: 'provider-options', providerOptions });

// Stream text to stdout
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
