/** Anthropic language models through Foundry's `/anthropic/v1/messages` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { notImplemented } from './internal/notImplemented.ts';

export const providerName = 'foundry-anthropic';

/** A catalog alias or a raw Foundry model RID. */
export const model = (
  modelId: string,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId }));

export const make = (_options: {
  readonly model: string;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> =>
  notImplemented('AnthropicLanguageModel.make');

export const layer = (options: {
  readonly model: string;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
