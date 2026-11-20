/** Google Gemini language models through Foundry's `/google/v1/models/{model}:generateContent` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { FoundryClient } from './FoundryClient.ts';
import { codecTransformer, makeRequest } from './internal/google-gemini/request.ts';
import { decodeResponse } from './internal/google-gemini/response.ts';
import * as Wire from './internal/google-gemini/schema.ts';
import { decodeStream } from './internal/google-gemini/stream.ts';
import { models } from './internal/models/google.ts';

export const providerName = 'foundry-google';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the `generationConfig` fields of the same name. */
export interface Config {
  /**
   * For example `{ includeThoughts: true, thinkingLevel: 'HIGH' }` to receive thought
   * summaries. Foundry rejects lower-case levels.
   */
  readonly thinkingConfig?: Wire.ThinkingConfig | undefined;
}

const known: Readonly<Record<string, { readonly rid: string }>> = models;

/** Known aliases resolve to their RIDs; a known RID or any other target passes through. */
const resolve = (modelId: string): string => known[modelId]?.rid ?? modelId;

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Every request replays the full prompt with each part's thought signature, which Gemini
 * requires on replayed function calls. Structured output sends Effect's default JSON Schema as
 * `responseJsonSchema`, or, beside function tools, as a synthetic `json` function that the
 * model is forced to call; that call comes back as the answer text.
 */
export const make = Effect.fnUntraced(function* (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}) {
  const client = yield* FoundryClient;
  const path = `/google/v1/models/${resolve(options.model)}`;
  const thinkingConfig = options.config?.thinkingConfig;
  return yield* LanguageModel.make({
    codecTransformer,
    generateText: Effect.fnUntraced(function* (providerOptions) {
      const { request, jsonTool } = yield* makeRequest(providerOptions, thinkingConfig);
      const body = yield* client.json({
        path: `${path}:generateContent`,
        body: request,
        schema: Wire.Response,
      });
      return yield* decodeResponse(body, providerOptions, jsonTool);
    }),
    streamText: (providerOptions) =>
      makeRequest(providerOptions, thinkingConfig).pipe(
        Effect.map(({ request, jsonTool }) =>
          decodeStream(
            client.sse({
              path: `${path}:streamGenerateContent`,
              urlParams: { alt: 'sse' },
              body: request,
            }),
            providerOptions,
            jsonTool,
          ),
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
