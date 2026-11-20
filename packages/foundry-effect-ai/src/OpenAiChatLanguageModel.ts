// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/** OpenAI language models through Foundry's `/openai/v1/chat/completions` route. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as AiModel from 'effect/ai/Model';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/openai.ts';
import { makeRequest, type Target } from './internal/openai-chat-completions/request.ts';
import { decodeResponse } from './internal/openai-chat-completions/response.ts';
import * as Wire from './internal/openai-chat-completions/schema.ts';
import { decodeStream } from './internal/openai-chat-completions/stream.ts';

export const providerName = 'foundry-openai';

/** A catalog alias or a raw Foundry model RID. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

/** Request-wide settings, sent as the Chat Completions fields of the same name. */
export interface Config {
  /**
   * How hard a reasoning model thinks. Chat Completions reports reasoning tokens in usage but
   * returns no reasoning text; use `OpenAiLanguageModel` for reasoning summaries.
   */
  readonly reasoning_effort?: Wire.ReasoningEffort | undefined;
}

const known: Readonly<
  Record<
    string,
    {
      readonly rid: string;
      readonly reasoning?: boolean;
      readonly chatToolsNeedNoReasoning?: boolean;
    }
  >
> = models;

/** Known aliases and RIDs get their catalog flags; any other target passes through as is. */
const resolve = (modelId: string): Target => {
  const entry =
    known[modelId] ?? Object.values(known).find((candidate) => candidate.rid === modelId);
  return {
    rid: entry?.rid ?? modelId,
    reasoning: entry?.reasoning === true,
    toolsNeedNoReasoning: entry?.chatToolsNeedNoReasoning === true,
  };
};

const path = '/openai/v1/chat/completions';

export const model = (
  modelId: ModelId,
  config?: Config,
): AiModel.Model<typeof providerName, LanguageModel.LanguageModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId, config }));

/**
 * Every request replays the full prompt. Function tools are strict unless a tool sets
 * otherwise, and reasoning models take system prompts as developer messages. GPT-6 Luna, Sol
 * and 6.1 Terra accept tools here only without reasoning, so a request with tools sends
 * `reasoning_effort: 'none'` unless `config` sets an effort. Streams ask for a final usage
 * chunk.
 */
export const make = Effect.fnUntraced(function* (options: {
  readonly model: ModelId;
  readonly config?: Config | undefined;
}) {
  const client = yield* FoundryClient;
  const target = resolve(options.model);
  const effort = options.config?.reasoning_effort;
  return yield* LanguageModel.make({
    codecTransformer: toCodecOpenAI,
    generateText: Effect.fnUntraced(function* (providerOptions) {
      const request = yield* makeRequest(providerOptions, target, effort);
      const body = yield* client.json({ path, body: request, schema: Wire.Body });
      return yield* decodeResponse(body, providerOptions);
    }),
    streamText: (providerOptions) =>
      makeRequest(providerOptions, target, effort).pipe(
        Effect.map((request) =>
          decodeStream(
            client.sse({
              path,
              body: { ...request, stream: true, stream_options: { include_usage: true } },
            }),
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
