// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/**
 * Responses server-sent events → Effect AI stream parts. The first `response.completed` or
 * `response.incomplete` closes open blocks, emits the finish and stops reading. An in-band
 * error fails the stream, and a stream that ends or sends `[DONE]` before a terminal event
 * fails with `InvalidResponseError`.
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
  decodeItem,
  finishReason,
  invalidResponse,
  itemMetadata,
  knownItem,
  providerError,
  timestamp,
  toolCall,
  usage,
} from './response.ts';
import * as Wire from './schema.ts';

const method = 'streamText';
const decodeData = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const decodeEvent = Schema.decodeUnknownEffect(Wire.Event);

export const decodeStream = (
  events: Stream.Stream<Sse.Event, AiError.AiError>,
  options: LanguageModel.ProviderOptions,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
  let finished = false;
  let hasToolCalls = false;
  let hasRefusal = false;
  // Open blocks by wire item: text by content index, reasoning by summary index.
  const text = new Map<string, Set<number>>();
  const reasoning = new Map<string, { encrypted: string | undefined; open: Set<number> }>();
  const toolCalls = new Map<number, string>();
  // Commentary would be joined with the answer and break JSON decoding.
  const commentary = new Set<string>();

  const endText = (itemId: string) => {
    const parts: Array<Response.StreamPartEncoded> = [];
    for (const index of text.get(itemId) ?? []) {
      parts.push({
        type: 'text-end',
        id: `${itemId}:${index}`,
        metadata: itemMetadata({ itemId }),
      });
    }
    text.delete(itemId);
    return parts;
  };

  const endReasoning = (itemId: string, indexes: Iterable<number>) => {
    const state = reasoning.get(itemId);
    const parts: Array<Response.StreamPartEncoded> = [];
    for (const index of indexes) {
      state?.open.delete(index);
      parts.push({
        type: 'reasoning-end',
        id: `${itemId}:${index}`,
        metadata: itemMetadata({ itemId, encryptedContent: state?.encrypted }),
      });
    }
    return parts;
  };

  /** Ends every open block, so a cut-off response still leaves well-formed parts. */
  const endAll = () => [
    ...[...text.keys()].flatMap((itemId) => endText(itemId)),
    ...[...reasoning].flatMap(([itemId, state]) => endReasoning(itemId, state.open)),
    ...[...toolCalls.values()].map((id): Response.StreamPartEncoded => ({
      type: 'tool-params-end',
      id,
    })),
  ];

  const handle = Effect.fnUntraced(function* (event: Sse.Event) {
    const parts: Array<Response.StreamPartEncoded> = [];
    if (event.data === '[DONE]') {
      return yield* invalidResponse(method, 'Stream sent [DONE] before response.completed');
    }
    const data = yield* Effect.mapError(decodeData(event.data), (error) =>
      invalidResponse(method, `Malformed event data: ${error.message}`),
    );
    if (
      !Predicate.hasProperty(data, 'type') ||
      typeof data.type !== 'string' ||
      !Wire.eventTypes.has(data.type)
    ) {
      return parts;
    }
    const decoded = yield* Effect.mapError(decodeEvent(data), (error) =>
      invalidResponse(method, error.message),
    );
    switch (decoded.type) {
      case 'response.created':
        parts.push({
          type: 'response-metadata',
          id: decoded.response.id,
          modelId: decoded.response.model,
          timestamp: timestamp(decoded.response.created_at),
        });
        break;
      case 'response.output_item.added':
      case 'response.output_item.done': {
        if (!knownItem(decoded.item)) {
          break;
        }
        const item = yield* decodeItem(method, decoded.item);
        const added = decoded.type === 'response.output_item.added';
        if (item.type === 'message') {
          if (options.responseFormat.type === 'json' && item.phase === 'commentary') {
            commentary.add(item.id);
          }
          if (added || commentary.has(item.id)) {
            break;
          }
          parts.push(...endText(item.id));
          const refusal = item.content.find((content) => content.type === 'refusal')?.refusal;
          if (refusal !== undefined) {
            // A refusal streams no text: an empty block carries the explanation.
            hasRefusal = true;
            const id = `${item.id}:refusal`;
            parts.push(
              { type: 'text-start', id },
              { type: 'text-end', id, metadata: itemMetadata({ itemId: item.id, refusal }) },
            );
          }
        } else if (item.type === 'reasoning') {
          const state = reasoning.get(item.id) ?? { encrypted: undefined, open: new Set() };
          state.encrypted = item.encrypted_content ?? state.encrypted;
          reasoning.set(item.id, state);
          if (added) {
            state.open.add(0);
            parts.push({
              type: 'reasoning-start',
              id: `${item.id}:0`,
              metadata: itemMetadata({ itemId: item.id, encryptedContent: state.encrypted }),
            });
          } else {
            parts.push(...endReasoning(item.id, state.open));
            reasoning.delete(item.id);
          }
        } else if (added) {
          toolCalls.set(decoded.output_index, item.call_id);
          parts.push({ type: 'tool-params-start', id: item.call_id, name: item.name });
        } else {
          toolCalls.delete(decoded.output_index);
          parts.push({ type: 'tool-params-end', id: item.call_id });
          // The finished item's arguments are authoritative; an incomplete call is not a call.
          if (item.status !== 'incomplete') {
            hasToolCalls = true;
            parts.push(yield* toolCall(method, options, item));
          }
        }
        break;
      }
      case 'response.output_text.delta': {
        if (commentary.has(decoded.item_id)) {
          break;
        }
        const open = text.get(decoded.item_id) ?? new Set();
        const id = `${decoded.item_id}:${decoded.content_index}`;
        if (!open.has(decoded.content_index)) {
          open.add(decoded.content_index);
          text.set(decoded.item_id, open);
          parts.push({
            type: 'text-start',
            id,
            metadata: itemMetadata({ itemId: decoded.item_id }),
          });
        }
        parts.push({ type: 'text-delta', id, delta: decoded.delta });
        break;
      }
      case 'response.reasoning_summary_text.delta': {
        const state = reasoning.get(decoded.item_id) ?? { encrypted: undefined, open: new Set() };
        reasoning.set(decoded.item_id, state);
        const id = `${decoded.item_id}:${decoded.summary_index}`;
        if (!state.open.has(decoded.summary_index)) {
          // A new summary part closes the previous ones; the last one closes with the item.
          parts.push(...endReasoning(decoded.item_id, state.open));
          state.open.add(decoded.summary_index);
          parts.push({
            type: 'reasoning-start',
            id,
            metadata: itemMetadata({ itemId: decoded.item_id }),
          });
        }
        parts.push({ type: 'reasoning-delta', id, delta: decoded.delta });
        break;
      }
      case 'response.function_call_arguments.delta': {
        const id = toolCalls.get(decoded.output_index);
        if (id !== undefined) {
          parts.push({ type: 'tool-params-delta', id, delta: decoded.delta });
        }
        break;
      }
      case 'response.completed':
      case 'response.incomplete':
        finished = true;
        parts.push(...endAll(), {
          type: 'finish',
          reason: finishReason({
            status:
              decoded.response.status ??
              (decoded.type === 'response.incomplete' ? 'incomplete' : undefined),
            reason: decoded.response.incomplete_details?.reason,
            hasToolCalls,
            hasRefusal,
          }),
          usage: usage(decoded.response.usage),
        });
        break;
      case 'response.failed':
        return yield* providerError(method, decoded.response.error ?? {});
      case 'error':
        return yield* providerError(
          method,
          decoded.error ?? { code: decoded.code, message: decoded.message },
        );
    }
    return parts;
  });

  return events.pipe(
    Stream.mapEffect(handle),
    // Stop reading at the terminal event, even if the connection stays open.
    Stream.takeUntil(() => finished),
    Stream.flattenIterable,
    Stream.concat(
      Stream.suspend(() =>
        finished
          ? Stream.empty
          : Stream.fail(invalidResponse(method, 'Stream ended before response.completed')),
      ),
    ),
  );
};
