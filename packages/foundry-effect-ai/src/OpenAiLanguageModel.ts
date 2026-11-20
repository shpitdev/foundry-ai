/** OpenAI language models through Foundry's `/openai/v1/responses` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { OpenAIModelId } from '../../foundry-catalog/src/openai-models.ts';
import type { FoundryClient } from './FoundryClient.ts';
import { notImplemented } from './internal/notImplemented.ts';

export const providerName = 'foundry-openai';

/** A catalog alias or a raw Foundry model RID. */
export const model = (
  modelId: OpenAIModelId,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId }));

export const make = (_options: {
  readonly model: string;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> =>
  notImplemented('OpenAiLanguageModel.make');

export const layer = (options: {
  readonly model: string;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
