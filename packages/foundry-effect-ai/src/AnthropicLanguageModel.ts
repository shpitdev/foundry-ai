// Adapted from @effect/ai-anthropic (MIT), effect@4.1.4, 82904fe.
/** Anthropic language models through Foundry's `/anthropic/v1/messages` route. */
import { toCodecAnthropic } from 'effect/ai/AnthropicStructuredOutput';
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { FoundryClient } from './FoundryClient.ts';
import { makeRequest, type Target } from './internal/anthropic-messages/request.ts';
import { decodeResponse } from './internal/anthropic-messages/response.ts';
import * as Wire from './internal/anthropic-messages/schema.ts';
import { decodeStream } from './internal/anthropic-messages/stream.ts';
import { models } from './internal/models/anthropic.ts';

export const providerName = 'foundry-anthropic';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Messages fields of the same name. */
export interface Config {
  /** Defaults to the model's output limit, or 4096 for a target outside the catalog. */
  readonly max_tokens?: number | undefined;
  /**
   * For example `{ type: 'adaptive' }`, or `{ type: 'enabled', budget_tokens: 2048 }` on models
   * before Claude 5.5. Thinking blocks replay with their signatures on later turns.
   */
  readonly thinking?: Wire.Thinking | undefined;
}

const known: Readonly<
  Record<
    string,
    {
      readonly rid: string;
      readonly maxOutputTokens: number;
      readonly rejectsForcedToolUse?: boolean;
    }
  >
> = models;

/** Known aliases and RIDs get their catalog flags; any other target passes through as is. */
const resolve = (modelId: string): Target => {
  const entry =
    known[modelId] ?? Object.values(known).find((candidate) => candidate.rid === modelId);
  return {
    rid: entry?.rid ?? modelId,
    maxOutputTokens: entry?.maxOutputTokens ?? 4096,
    rejectsForcedToolUse: entry?.rejectsForcedToolUse === true,
  };
};

const path = '/anthropic/v1/messages';
const headers = { 'anthropic-version': '2023-06-01' };

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Claude Opus and Sonnet 5.5 reject forced tool use, so their structured output is native
 * `output_config.format`; other models answer through a forced JSON tool. Tool input is never
 * streamed eagerly: Foundry does not support it.
 */
export const make = Effect.fnUntraced(function* (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}) {
  const client = yield* FoundryClient;
  const target = resolve(options.model);
  const config = options.config;
  return yield* LanguageModel.make({
    codecTransformer: toCodecAnthropic,
    generateText: Effect.fnUntraced(function* (providerOptions) {
      const request = yield* makeRequest(providerOptions, target, config);
      const body = yield* client.json({ path, headers, body: request, schema: Wire.Body });
      return yield* decodeResponse(body, providerOptions, target);
    }),
    streamText: (providerOptions) =>
      makeRequest(providerOptions, target, config).pipe(
        Effect.map((request) =>
          decodeStream(
            client.sse({ path, headers, body: { ...request, stream: true } }),
            providerOptions,
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
