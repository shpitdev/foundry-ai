// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/**
 * Chat Completions server-sent events → Effect AI stream parts. Requests ask for usage, and
 * Foundry ends the stream after the usage chunk that follows `finish_reason`, without `[DONE]`.
 * The stream finishes at `[DONE]` once a choice has finished, or at the end of the body once
 * that usage chunk has arrived; anything shorter fails with `InvalidResponseError`. Tool calls
 * complete then, and an in-band error fails the stream. Reasoning and text alternate as blocks:
 * a new block of one kind ends the open block of the other.
 */
import type * as AiError from 'effect/ai/AiError';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import type * as Sse from 'effect/encoding/Sse';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import type * as ReasoningTags from './reasoningTags.ts';
import type { Dialect } from './request.ts';
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
  dialect: Dialect,
  events: Stream.Stream<Sse.Event, AiError.AiError>,
  options: LanguageModel.ProviderOptions,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
  let done = false;
  // The stream's first chunk ID, the base of every block ID.
  let streamId: string | undefined;
  // The open text or reasoning block, and how many of each kind have opened.
  let open: { readonly type: ReasoningTags.Segment['type']; readonly id: string } | undefined;
  const opened = { text: 0, reasoning: 0 };
  const tags = dialect.reasoningTags?.();
  let refusal = '';
  let reason: string | undefined;
  let latestUsage: typeof Wire.Usage.Type | undefined;
  // The usage chunk arrived with or after the finish reason.
  let complete = false;
  // Calls by their `index`, in arrival order; arguments arrive in pieces.
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  const end = (parts: Array<Response.StreamPartEncoded>) => {
    if (open !== undefined) {
      parts.push({ type: open.type === 'text' ? 'text-end' : 'reasoning-end', id: open.id });
      open = undefined;
    }
  };

  /** Appends a delta to the open block of its kind, opening one if needed. */
  const write = (parts: Array<Response.StreamPartEncoded>, segment: ReasoningTags.Segment) => {
    if (open?.type !== segment.type) {
      end(parts);
      const count = opened[segment.type]++;
      // The first text block keeps the ID OpenAI streams have always had.
      const id = `${streamId}:${segment.type}${count === 0 ? '' : `:${count}`}`;
      open = { type: segment.type, id };
      parts.push({ type: segment.type === 'text' ? 'text-start' : 'reasoning-start', id });
    }
    parts.push({
      type: segment.type === 'text' ? 'text-delta' : 'reasoning-delta',
      id: open.id,
      delta: segment.text,
    });
  };

  const finish = Effect.fnUntraced(function* (sentinel: boolean) {
    if (reason === undefined) {
      return yield* invalidResponse(dialect, method, 'Stream ended before a finish_reason');
    }
    if (!sentinel && !complete) {
      return yield* invalidResponse(dialect, method, 'Stream ended before its final usage chunk');
    }
    const parts: Array<Response.StreamPartEncoded> = [];
    for (const segment of tags?.flush() ?? []) {
      write(parts, segment);
    }
    end(parts);
    let hasToolCalls = false;
    for (const call of calls.values()) {
      parts.push({ type: 'tool-params-end', id: call.id });
      if (callsComplete(reason)) {
        hasToolCalls = true;
        parts.push(yield* toolCall(dialect, method, options, call));
      }
    }
    parts.push({
      type: 'finish',
      reason: finishReason(reason, hasToolCalls, refusal !== ''),
      usage: usage(latestUsage),
      ...finishMetadata(dialect, refusal),
    });
    return parts;
  });

  const handle = Effect.fnUntraced(function* (event: Sse.Event) {
    if (event.data === '[DONE]') {
      done = true;
      return yield* finish(true);
    }
    const data = yield* Effect.mapError(decodeData(event.data), (error) =>
      invalidResponse(dialect, method, `Malformed event data: ${error.message}`),
    );
    if (Predicate.hasProperty(data, 'error') && data.error != null) {
      const envelope = yield* Effect.mapError(decodeError(data), (error) =>
        invalidResponse(dialect, method, error.message),
      );
      return yield* providerError(dialect, method, envelope);
    }
    const chunk = yield* Effect.mapError(decodeChunk(data), (error) =>
      invalidResponse(dialect, method, error.message),
    );
    const parts: Array<Response.StreamPartEncoded> = [];
    if (streamId === undefined) {
      streamId = chunk.id;
      parts.push(metadataPart(chunk));
    }
    const [choice] = chunk.choices;
    const delta = choice?.delta;
    const reasoning = delta?.reasoning_content ?? '';
    if (dialect.reasoningContent && reasoning !== '') {
      write(parts, { type: 'reasoning', text: reasoning });
    }
    const content = delta?.content ?? '';
    if (content !== '') {
      for (const segment of tags?.push(content) ?? [{ type: 'text' as const, text: content }]) {
        write(parts, segment);
      }
    }
    refusal += delta?.refusal ?? '';
    for (const piece of delta?.tool_calls ?? []) {
      const args = piece.function?.arguments ?? '';
      let call = calls.get(piece.index);
      if (call === undefined) {
        const name = piece.function?.name;
        if (name == null) {
          return yield* invalidResponse(
            dialect,
            method,
            `Tool call ${piece.index} started without a name`,
          );
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
