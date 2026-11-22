/** Moonshot Kimi language models through Foundry's `/openai/v1/chat/completions` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/moonshot.ts';
import * as ChatModel from './internal/openai-chat-completions/languageModel.ts';
import type * as Wire from './internal/openai-chat-completions/schema.ts';

export const providerName = 'foundry-moonshot';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Chat Completions fields of the same name. */
export interface Config {
  /**
   * Kimi K3.1 and K3 reason by default and return it as `reasoning_content`, which comes back as
   * reasoning parts; `'none'` turns reasoning off.
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
 * Every request replays the full prompt without the reasoning: Foundry rejects
 * `reasoning_content` on assistant messages (HTTP 400). Function tools are strict unless a tool
 * sets otherwise. `parallel_tool_calls` is rejected, so it is never sent.
 */
export const make = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> =>
  ChatModel.make({
    module: 'MoonshotLanguageModel',
    metadataKey: providerName,
    path: '/openai/v1/chat/completions',
    model: known[options.model]?.rid ?? options.model,
    systemRole: 'system',
    reasoningEffort: options.config?.reasoning_effort,
    toolsNeedNoReasoning: false,
    reasoningText: 'reasoning-content',
  });

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
