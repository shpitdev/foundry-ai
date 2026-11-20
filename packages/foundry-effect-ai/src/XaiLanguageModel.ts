/** xAI language models through Foundry's `/xai/v1/responses` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/xai.ts';
import * as ResponsesModel from './internal/openai-responses/languageModel.ts';

export const providerName = 'foundry-xai';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Responses fields of the same name. */
export interface Config {
  /** For example `{ effort: 'low' }`. Foundry's Grok models reject `effort: 'none'`. */
  readonly reasoning?:
    | {
        readonly effort?: 'low' | 'medium' | 'high' | 'xhigh';
        readonly summary?: 'auto' | 'concise' | 'detailed';
      }
    | undefined;
}

const known: Readonly<Record<string, { readonly rid: string }>> = models;

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Every request is stateless (`store: false`), replays the full prompt and asks for encrypted
 * reasoning, which later turns send back. Function tools are strict unless a tool sets otherwise.
 */
export const make = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> =>
  ResponsesModel.make({
    module: 'XaiLanguageModel',
    metadataKey: providerName,
    path: '/xai/v1/responses',
    model: known[options.model]?.rid ?? options.model,
    systemRole: 'system',
    encryptedReasoning: true,
    reasoning: options.config?.reasoning,
  });

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
