/** Qwen language models through Foundry's `/openai/v1/chat/completions` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/qwen.ts';
import * as ChatModel from './internal/openai-chat-completions/languageModel.ts';
import type * as Wire from './internal/openai-chat-completions/schema.ts';

export const providerName = 'foundry-qwen';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Chat Completions fields of the same name. */
export interface Config {
  /**
   * `'high'` makes the model reason; its `<reasoning>` spans come back as reasoning parts. Without
   * an effort, or with `'none'`, the model shows no reasoning. Under `'high'` a structured answer
   * can land inside the reasoning, so leave it unset for `generateObject`.
   */
  readonly reasoning_effort?: Wire.ReasoningEffort | undefined;
}

const known: Readonly<Record<string, { readonly rid: string }>> = models;

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Every request replays the full prompt without the reasoning. Function tools are strict unless
 * a tool sets otherwise. Foundry rejects image input for these models (HTTP 404) and rejects
 * `parallel_tool_calls`, which is never sent; the model may still return several calls.
 */
export const make = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> =>
  ChatModel.make({
    module: 'QwenLanguageModel',
    metadataKey: providerName,
    path: '/openai/v1/chat/completions',
    model: known[options.model]?.rid ?? options.model,
    systemRole: 'system',
    reasoningEffort: options.config?.reasoning_effort,
    toolsNeedNoReasoning: false,
    reasoningText: 'content-tags',
  });

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
