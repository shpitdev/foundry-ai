/** Gemma language models through Foundry's `/openai/v1/responses` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/gemma.ts';
import * as ResponsesModel from './internal/openai-responses/languageModel.ts';

export const providerName = 'foundry-gemma';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

const known: Readonly<Record<string, { readonly rid: string }>> = models;

/** Gemma takes no request-wide settings: Foundry exposes no reasoning control that changes it. */
export const model = (
  modelId: ModelId,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId }));

/**
 * Every request is stateless (`store: false`) and replays the full prompt. Function tools are
 * strict unless a tool sets otherwise. Gemma returns no reasoning, so nothing asks for it.
 */
export const make = (options: {
  readonly model: ModelId;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> =>
  ResponsesModel.make({
    module: 'GemmaLanguageModel',
    metadataKey: providerName,
    path: '/openai/v1/responses',
    model: known[options.model]?.rid ?? options.model,
    systemRole: 'system',
    encryptedReasoning: false,
  });

export const layer = (options: {
  readonly model: ModelId;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
