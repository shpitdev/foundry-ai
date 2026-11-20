// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/**
 * Chat Completions server-sent events → Effect AI stream parts. Requests ask for usage, and
 * Foundry ends the stream after the usage chunk that follows `finish_reason`, without `[DONE]`.
 * The stream finishes at `[DONE]` once a choice has finished, or at the end of the body once
 * that usage chunk has arrived; anything shorter fails with `InvalidResponseError`. Tool calls
 * complete then, and an in-band error fails the stream.
 */
import type * as AiError from 'effect/ai/AiError';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import type * as Sse from 'effect/encoding/Sse';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import {
  callsComplete,
  finishMetadata,
  finishReason,
  invalidResponse,
  metadataPart,
  providerError,
  toolCall,
  usage,
} from './response.ts';
import * as Wire from './schema.ts';

const method = 'streamText';
const decodeData = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const decodeError = Schema.decodeUnknownEffect(Wire.ErrorEnvelope);
const decodeChunk = Schema.decodeUnknownEffect(Wire.Chunk);

export const decodeStream = (
  events: Stream.Stream<Sse.Event, AiError.AiError>,
  options: LanguageModel.ProviderOptions,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
  let done = false;
  let textId: string | undefined;
  let textOpen = false;
  let refusal = '';
  let reason: string | undefined;
  let latestUsage: typeof Wire.Usage.Type | undefined;
  // The usage chunk arrived with or after the finish reason.
  let complete = false;
  // Calls by their `index`, in arrival order; arguments arrive in pieces.
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  const finish = Effect.fnUntraced(function* (sentinel: boolean) {
    if (reason === undefined) {
      return yield* invalidResponse(method, 'Stream ended before a finish_reason');
    }
    if (!sentinel && !complete) {
      return yield* invalidResponse(method, 'Stream ended before its final usage chunk');
    }
    const parts: Array<Response.StreamPartEncoded> = [];
    if (textOpen && textId !== undefined) {
      parts.push({ type: 'text-end', id: textId });
    }
    let hasToolCalls = false;
    for (const call of calls.values()) {
      parts.push({ type: 'tool-params-end', id: call.id });
      if (callsComplete(reason)) {
        hasToolCalls = true;
        parts.push(yield* toolCall(method, options, call));
      }
    }
    parts.push({
      type: 'finish',
      reason: finishReason(reason, hasToolCalls, refusal !== ''),
      usage: usage(latestUsage),
      ...finishMetadata(refusal),
    });
    return parts;
  });

  const handle = Effect.fnUntraced(function* (event: Sse.Event) {
    if (event.data === '[DONE]') {
      done = true;
      return yield* finish(true);
    }
    const data = yield* Effect.mapError(decodeData(event.data), (error) =>
      invalidResponse(method, `Malformed event data: ${error.message}`),
    );
    if (Predicate.hasProperty(data, 'error') && data.error != null) {
      const envelope = yield* Effect.mapError(decodeError(data), (error) =>
        invalidResponse(method, error.message),
      );
      return yield* providerError(method, envelope);
    }
    const chunk = yield* Effect.mapError(decodeChunk(data), (error) =>
      invalidResponse(method, error.message),
    );
    const parts: Array<Response.StreamPartEncoded> = [];
    if (textId === undefined) {
      textId = `${chunk.id}:text`;
      parts.push(metadataPart(chunk));
    }
    const [choice] = chunk.choices;
    const delta = choice?.delta;
    if (delta?.content != null && delta.content !== '') {
      if (!textOpen) {
        textOpen = true;
        parts.push({ type: 'text-start', id: textId });
      }
      parts.push({ type: 'text-delta', id: textId, delta: delta.content });
    }
    refusal += delta?.refusal ?? '';
    for (const piece of delta?.tool_calls ?? []) {
      const args = piece.function?.arguments ?? '';
      let call = calls.get(piece.index);
      if (call === undefined) {
        const name = piece.function?.name;
        if (name == null) {
          return yield* invalidResponse(method, `Tool call ${piece.index} started without a name`);
        }
        call = { id: piece.id ?? `${chunk.id}:tool:${piece.index}`, name, arguments: '' };
        calls.set(piece.index, call);
        parts.push({ type: 'tool-params-start', id: call.id, name });
      }
      if (args !== '') {
        call.arguments += args;
        parts.push({ type: 'tool-params-delta', id: call.id, delta: args });
      }
    }
    reason = choice?.finish_reason ?? reason;
    // Usage frames are totals so far; the latest wins.
    if (chunk.usage != null) {
      latestUsage = chunk.usage;
      complete = reason !== undefined;
    }
    return parts;
  });

  return events.pipe(
    Stream.mapEffect(handle),
    Stream.takeUntil(() => done),
    Stream.flattenIterable,
    Stream.concat(
      Stream.suspend(() =>
        done ? Stream.empty : Stream.flattenIterable(Stream.fromEffect(finish(false))),
      ),
    ),
  );
};
