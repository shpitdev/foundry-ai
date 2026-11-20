// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/**
 * Responses server-sent events → Effect AI stream parts. Only `response.completed` or
 * `response.incomplete` finishes a stream: an in-band error fails it, and a stream that ends
 * without a terminal event fails with `InvalidResponseError`.
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
  toolParams,
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
  // Open reasoning blocks by item, by summary index, with the item's latest ciphertext.
  const reasoning = new Map<string, { encrypted: string | undefined; open: Set<number> }>();
  const toolCalls = new Map<number, { readonly id: string; readonly name: string }>();

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

  const handle = Effect.fnUntraced(function* (event: Sse.Event) {
    const parts: Array<Response.StreamPartEncoded> = [];
    if (event.data === '[DONE]') {
      return parts;
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
          parts.push({
            type: added ? 'text-start' : 'text-end',
            id: item.id,
            metadata: itemMetadata({ itemId: item.id }),
          });
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
          toolCalls.set(decoded.output_index, { id: item.call_id, name: item.name });
          parts.push({ type: 'tool-params-start', id: item.call_id, name: item.name });
        } else {
          // The finished item's arguments are authoritative over the streamed deltas.
          hasToolCalls = true;
          toolCalls.delete(decoded.output_index);
          parts.push(
            { type: 'tool-params-end', id: item.call_id },
            {
              type: 'tool-call',
              id: item.call_id,
              name: item.name,
              params: yield* toolParams(method, options, item.name, item.arguments),
              metadata: itemMetadata({ itemId: item.id }),
            },
          );
        }
        break;
      }
      case 'response.output_text.delta':
        parts.push({ type: 'text-delta', id: decoded.item_id, delta: decoded.delta });
        break;
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
        const call = toolCalls.get(decoded.output_index);
        if (call !== undefined) {
          parts.push({ type: 'tool-params-delta', id: call.id, delta: decoded.delta });
        }
        break;
      }
      case 'response.completed':
      case 'response.incomplete':
        finished = true;
        parts.push({
          type: 'finish',
          reason: finishReason(decoded.response.incomplete_details?.reason, hasToolCalls),
          usage: usage(decoded.response.usage),
        });
        break;
      case 'response.failed':
        return yield* providerError(method, decoded.response.error ?? {});
      case 'error':
        return yield* providerError(method, decoded);
    }
    return parts;
  });

  return events.pipe(
    Stream.mapEffect(handle),
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
