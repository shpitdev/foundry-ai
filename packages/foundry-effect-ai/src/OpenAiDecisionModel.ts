/** OpenAI decision models (GPT-6 Luna) through Foundry's `/openai/v1/decisions` route. */
import * as DecisionModel from 'effect/ai/DecisionModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { notImplemented } from './internal/notImplemented.ts';

export const providerName = 'foundry-openai';

/** A catalog alias or a raw Foundry model RID. */
export const model = (
  modelId: string,
): AiModel.Model<typeof providerName, DecisionModel.DecisionModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId }));

export const make = (_options: {
  readonly model: string;
}): Effect.Effect<DecisionModel.DecisionModel, never, FoundryClient> =>
  notImplemented('OpenAiDecisionModel.make');

export const layer = (options: {
  readonly model: string;
}): Layer.Layer<DecisionModel.DecisionModel, never, FoundryClient> =>
  Layer.effect(DecisionModel.DecisionModel, make(options));
