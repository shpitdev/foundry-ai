/** Z.ai GLM language models through Foundry's `/openai/v1/chat/completions` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/zai.ts';
import * as ChatModel from './internal/openai-chat-completions/languageModel.ts';
import { makeSplitter } from './internal/openai-chat-completions/reasoningTags.ts';

export const providerName = 'foundry-zai';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

export interface Config {
  /**
   * GLM-5 exposes `<reasoning>` spans at `'high'`. GLM-5.3 only reports reasoning token usage.
   * `'none'` is sent only to GLM-5; `'xhigh'` and `'max'` only to GLM-5.3. Otherwise those
   * values are omitted, so Foundry uses the model's default.
   */
  readonly reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
}

const known: Readonly<Record<string, { readonly rid: string }>> = models;

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/** Reasoning is never replayed. Foundry rejects image input and `parallel_tool_calls`. */
export const make = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> => {
  const rid = known[options.model]?.rid ?? options.model;
  const isGlm5 = rid === models['glm-5'].rid;
  const isGlm53 = rid === models['glm-5.3'].rid;
  const effort = options.config?.reasoning_effort;
  const accepted =
    effort === 'low' ||
    effort === 'medium' ||
    effort === 'high' ||
    (effort === 'none' && isGlm5) ||
    ((effort === 'xhigh' || effort === 'max') && isGlm53);
  return ChatModel.make({
    module: 'ZaiLanguageModel',
    metadataKey: providerName,
    path: '/openai/v1/chat/completions',
    model: rid,
    systemRole: 'system',
    reasoningEffort: accepted ? effort : undefined,
    toolsNeedNoReasoning: false,
    reasoningContent: false,
    reasoningTags: isGlm5 && effort === 'high' ? makeSplitter : undefined,
  });
};

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
