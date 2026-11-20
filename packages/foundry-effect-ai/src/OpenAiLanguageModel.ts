// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** OpenAI language models through Foundry's `/openai/v1/responses` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/openai.ts';
import { makeRequest, type Target } from './internal/openai-responses/request.ts';
import { decodeResponse } from './internal/openai-responses/response.ts';
import * as Wire from './internal/openai-responses/schema.ts';
import { decodeStream } from './internal/openai-responses/stream.ts';

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
const resolve = (modelId: string): Target => {
  const entry =
    known[modelId] ?? Object.values(known).find((candidate) => candidate.rid === modelId);
  return { rid: entry?.rid ?? modelId, reasoning: entry?.reasoning === true };
};

const path = '/openai/v1/responses';

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
export const make = Effect.fnUntraced(function* (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}) {
  const client = yield* FoundryClient;
  const target = resolve(options.model);
  const reasoning = options.config?.reasoning;
  return yield* LanguageModel.make({
    codecTransformer: toCodecOpenAI,
    generateText: Effect.fnUntraced(function* (providerOptions) {
      const request = yield* makeRequest(providerOptions, target, reasoning);
      const body = yield* client.json({ path, body: request, schema: Wire.Response });
      return yield* decodeResponse(body, providerOptions);
    }),
    streamText: (providerOptions) =>
      makeRequest(providerOptions, target, reasoning).pipe(
        Effect.map((request) =>
          decodeStream(client.sse({ path, body: { ...request, stream: true } }), providerOptions),
        ),
        Stream.unwrap,
      ),
  });
});

export const layer = (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}): Layer.Layer<LanguageModel.LanguageModel, never, FoundryClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options));
