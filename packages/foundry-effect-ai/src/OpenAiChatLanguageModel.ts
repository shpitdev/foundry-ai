// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/** OpenAI language models through Foundry's `/openai/v1/chat/completions` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/openai.ts';
import * as ChatModel from './internal/openai-chat-completions/languageModel.ts';
import type * as Wire from './internal/openai-chat-completions/schema.ts';

export const providerName = 'foundry-openai';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Chat Completions fields of the same name. */
export interface Config {
  /**
   * How hard a reasoning model thinks. Chat Completions reports reasoning tokens in usage but
   * returns no reasoning text; use `OpenAiLanguageModel` for reasoning summaries.
   */
  readonly reasoning_effort?: Wire.ReasoningEffort | undefined;
}

const known: Readonly<
  Record<
    string,
    {
      readonly rid: string;
      readonly reasoning?: boolean;
      readonly chatToolsNeedNoReasoning?: boolean;
    }
  >
> = models;

/** Known aliases and RIDs get their catalog flags; any other target passes through as is. */
const resolve = (modelId: string) =>
  known[modelId] ?? Object.values(known).find((candidate) => candidate.rid === modelId);

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Every request replays the full prompt. Function tools are strict unless a tool sets
 * otherwise, and reasoning models take system prompts as developer messages. GPT-6 Luna, Sol
 * and 6.1 Terra accept tools here only without reasoning, so a request with tools sends
 * `reasoning_effort: 'none'` unless `config` sets an effort. Streams ask for a final usage
 * chunk.
 */
export const make = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> => {
  const entry = resolve(options.model);
  return ChatModel.make({
    module: 'OpenAiChatLanguageModel',
    metadataKey: providerName,
    path: '/openai/v1/chat/completions',
    model: entry?.rid ?? options.model,
    systemRole: entry?.reasoning === true ? 'developer' : 'system',
    reasoningEffort: options.config?.reasoning_effort,
    toolsNeedNoReasoning: entry?.chatToolsNeedNoReasoning === true,
    reasoningContent: false,
    reasoningTags: undefined,
  });
};

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
