// Adapted from @ai-sdk/google (Apache-2.0), 4.0.122.
/**
 * `streamGenerateContent?alt=sse` events → Effect AI stream parts. Each event is a response
 * chunk. Text and thoughts open a block on their first delta and close on a switch, a function
 * call or the end. Gemini sends no terminal event: the finish comes at end of stream, and only
 * after a chunk reported a finish reason or a prompt block; otherwise the stream was cut off and
 * fails with `InvalidResponseError`. An in-band error fails the stream.
 */
import type * as AiError from 'effect/ai/AiError';
import type * as IdGenerator from 'effect/ai/IdGenerator';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import type * as Sse from 'effect/encoding/Sse';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import {
  blocked,
  finishReason,
  hasUsage,
  invalidResponse,
  jsonText,
  partText,
  providerError,
  responseMetadata,
  signed,
  toolCall,
  usage,
} from './response.ts';
import * as Wire from './schema.ts';

const method = 'streamText';
const decodeChunk = Schema.decodeUnknownEffect(Schema.fromJsonString(Wire.Response));

/** An open text or reasoning block, and the signature that closed it. */
interface Block {
  readonly kind: 'text' | 'reasoning';
  readonly id: string;
  signature?: string;
}

export const decodeStream = (
  events: Stream.Stream<Sse.Event, AiError.AiError>,
  options: LanguageModel.ProviderOptions,
  jsonTool: string | undefined,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError, IdGenerator.IdGenerator> => {
  let started = false;
  let blocks = 0;
  let open: Block | undefined;
  let reason: string | undefined;
  let isBlocked = false;
  let hasToolCalls = false;
  let lastUsage: typeof Wire.UsageMetadata.Type | undefined;

  const end = (): Array<Response.StreamPartEncoded> => {
    if (open === undefined) {
      return [];
    }
    const { kind, id, signature } = open;
    open = undefined;
    return [
      kind === 'text'
        ? { type: 'text-end', id, ...signed(signature) }
        : { type: 'reasoning-end', id, ...signed(signature) },
    ];
  };

  /** The open block of this kind, opening one (and closing any other) if needed. */
  const ensure = (kind: Block['kind'], parts: Array<Response.StreamPartEncoded>): Block => {
    if (open?.kind === kind) {
      return open;
    }
    parts.push(...end());
    const block: Block = { kind, id: String(blocks++) };
    open = block;
    parts.push(
      kind === 'text'
        ? { type: 'text-start', id: block.id }
        : { type: 'reasoning-start', id: block.id },
    );
    return block;
  };

  const handle = Effect.fnUntraced(function* (event: Sse.Event) {
    const chunk = yield* Effect.mapError(decodeChunk(event.data), (error) =>
      invalidResponse(method, `Malformed event data: ${error.message}`),
    );
    if (chunk.error !== undefined) {
      return yield* providerError(method, chunk.error);
    }
    const parts: Array<Response.StreamPartEncoded> = [];
    if (!started) {
      started = true;
      parts.push(responseMetadata(chunk));
    }
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.functionCall !== undefined && part.functionCall.name !== jsonTool) {
        // Gemini sends a call's arguments whole, in one part.
        parts.push(...end());
        hasToolCalls = true;
        const call = yield* toolCall(method, options, part.functionCall, part.thoughtSignature);
        const delta = yield* jsonText(method, call.params);
        parts.push(
          { type: 'tool-params-start', id: call.id, name: call.name },
          { type: 'tool-params-delta', id: call.id, delta },
          { type: 'tool-params-end', id: call.id },
          call,
        );
        continue;
      }
      const text = yield* partText(method, part);
      if (text === undefined || (text === '' && part.thoughtSignature === undefined)) {
        continue;
      }
      const block = ensure(part.thought === true ? 'reasoning' : 'text', parts);
      if (text !== '') {
        parts.push(
          block.kind === 'text'
            ? { type: 'text-delta', id: block.id, delta: text }
            : { type: 'reasoning-delta', id: block.id, delta: text },
        );
      }
      // A signature ends its wire part, so it closes the block and replays in place.
      if (part.thoughtSignature !== undefined) {
        block.signature = part.thoughtSignature;
        parts.push(...end());
      }
    }
    reason = candidate?.finishReason ?? reason;
    isBlocked ||= blocked(chunk);
    if (hasUsage(chunk.usageMetadata)) {
      lastUsage = chunk.usageMetadata;
    }
    return parts;
  });

  return events.pipe(
    Stream.mapEffect(handle),
    Stream.flattenIterable,
    Stream.concat(
      Stream.suspend(() =>
        reason === undefined && !isBlocked
          ? Stream.fail(invalidResponse(method, 'Stream ended before a finish reason'))
          : Stream.fromIterable<Response.StreamPartEncoded>([
              ...end(),
              {
                type: 'finish',
                reason: finishReason({ reason, blocked: isBlocked, hasToolCalls }),
                usage: usage(lastUsage),
              },
            ]),
      ),
    ),
  );
};
