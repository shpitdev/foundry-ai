// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** OpenAI language models through Foundry's `/openai/v1/responses` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/openai.ts';
import * as ResponsesModel from './internal/openai-responses/languageModel.ts';
import type * as Wire from './internal/openai-responses/schema.ts';

export const providerName = 'foundry-openai';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Responses fields of the same name. */
export interface Config {
  /** For example `{ summary: 'auto' }` to receive reasoning summaries. */
  readonly reasoning?: Wire.Reasoning | undefined;
}

const known: Readonly<Record<string, { readonly rid: string; readonly reasoning?: boolean }>> =
  models;

/** Known aliases and RIDs get their catalog flags; any other target passes through as is. */
const resolve = (modelId: string) =>
  known[modelId] ?? Object.values(known).find((candidate) => candidate.rid === modelId);

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Every request is stateless (`store: false`) and replays the full prompt. Function tools are
 * strict unless a tool sets otherwise. Reasoning models get developer messages and encrypted
 * reasoning, which later turns send back.
 */
export const make = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Effect.Effect<LanguageModel.LanguageModel, never, FoundryClient> => {
  const entry = resolve(options.model);
  const reasoning = entry?.reasoning === true;
  return ResponsesModel.make({
    module: 'OpenAiLanguageModel',
    metadataKey: providerName,
    path: '/openai/v1/responses',
    model: entry?.rid ?? options.model,
    systemRole: reasoning ? 'developer' : 'system',
    encryptedReasoning: reasoning,
    reasoning: options.config?.reasoning,
  });
};

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
