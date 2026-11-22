// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/** A Chat Completions language model on Foundry's Chat route, shaped by one maker's dialect. */
import * as LanguageModel from 'effect/ai/LanguageModel';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import { FoundryClient } from '../../FoundryClient.ts';
import { type Dialect, makeRequest } from './request.ts';
import { decodeResponse } from './response.ts';
import * as Wire from './schema.ts';
import { decodeStream } from './stream.ts';

/** Streams ask for a final usage chunk, which is also how a complete stream is recognized. */
export const make = Effect.fnUntraced(function* (dialect: Dialect) {
  const client = yield* FoundryClient;
  const { path } = dialect;
  return yield* LanguageModel.make({
    codecTransformer: toCodecOpenAI,
    generateText: Effect.fnUntraced(function* (options) {
      const request = yield* makeRequest(options, dialect);
      const body = yield* client.json({ path, body: request, schema: Wire.Body });
      return yield* decodeResponse(dialect, body, options);
    }),
    streamText: (options) =>
      makeRequest(options, dialect).pipe(
        Effect.map((request) =>
          decodeStream(
            dialect,
            client.sse({
              path,
              body: { ...request, stream: true, stream_options: { include_usage: true } },
            }),
            options,
          ),
        ),
        Stream.unwrap,
      ),
  });
});
