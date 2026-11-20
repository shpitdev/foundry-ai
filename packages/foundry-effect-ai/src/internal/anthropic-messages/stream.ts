// Adapted from @effect/ai-anthropic (MIT), effect@4.1.4, 82904fe.
/**
 * Messages server-sent events → Effect AI stream parts. Blocks are tracked by `index`; a
 * thinking block's signature arrives as a delta and is attached to its end part. `message_stop`
 * closes any open blocks, emits the finish and stops reading. An in-band `error` fails the
 * stream, and a stream that ends before `message_stop` fails with `InvalidResponseError`.
 */
import * as AiError from 'effect/ai/AiError';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Tool from 'effect/ai/Tool';
import * as Effect from 'effect/Effect';
import type * as Sse from 'effect/encoding/Sse';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { stringify } from './request.ts';
import {
  decodeBlock,
  decodeDelta,
  finishReason,
  invalidResponse,
  isKnown,
  metadata,
  providerError,
  toolCall,
  usage,
} from './response.ts';
import * as Wire from './schema.ts';

const method = 'streamText';
const decodeData = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const decodeEvent = Schema.decodeUnknownEffect(Wire.Event);

type Block =
  | { readonly type: 'text' }
  | { readonly type: 'reasoning'; signature?: string; readonly redactedData?: string }
  | { readonly type: 'tool'; readonly id: string; readonly name: string; input: string };

export const decodeStream = (
  events: Stream.Stream<Sse.Event, AiError.AiError>,
  options: LanguageModel.ProviderOptions,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
  let finished = false;
  let stopReason: string | null | undefined;
  // `message_delta` usage is cumulative: each reported count replaces the earlier one.
  const counts: Record<string, number> = {};
  const blocks = new Map<number, Block>();

  const mergeUsage = (wire: typeof Wire.Usage.Type | null | undefined) => {
    for (const [key, value] of Object.entries(wire ?? {})) {
      if (typeof value === 'number') {
        counts[key] = value;
      }
    }
  };

  const end = Effect.fnUntraced(function* (index: number) {
    const block = blocks.get(index);
    blocks.delete(index);
    const id = String(index);
    if (block === undefined) {
      return [];
    }
    if (block.type === 'text') {
      return [{ type: 'text-end', id } as const];
    }
    if (block.type === 'reasoning') {
      return [
        {
          type: 'reasoning-end',
          id,
          metadata: metadata({ signature: block.signature, redactedData: block.redactedData }),
        } as const,
      ];
    }
    const input = yield* Effect.try({
      try: () => Tool.unsafeSecureJsonParse(block.input === '' ? '{}' : block.input),
      catch: (cause) =>
        AiError.make({
          module: 'AnthropicLanguageModel',
          method,
          reason: new AiError.ToolParameterValidationError({
            toolName: block.name,
            description: `Tool input is not valid JSON: ${String(cause)}`,
          }),
        }),
    });
    return [
      { type: 'tool-params-end', id: block.id } as const,
      yield* toolCall(method, options, { id: block.id, name: block.name, input }),
    ];
  });

  const handle = Effect.fnUntraced(function* (event: Sse.Event) {
    const parts: Array<Response.StreamPartEncoded> = [];
    const data = yield* Effect.mapError(decodeData(event.data), (error) =>
      invalidResponse(method, `Malformed event data: ${error.message}`),
    );
    if (!isKnown(data, Wire.eventTypes)) {
      return parts;
    }
    const decoded = yield* Effect.mapError(decodeEvent(data), (error) =>
      invalidResponse(method, error.message),
    );
    switch (decoded.type) {
      case 'message_start':
        mergeUsage(decoded.message.usage);
        parts.push({
          type: 'response-metadata',
          id: decoded.message.id,
          modelId: decoded.message.model,
        });
        break;
      case 'content_block_start': {
        if (!isKnown(decoded.content_block, Wire.contentBlockTypes)) {
          break;
        }
        const block = yield* decodeBlock(method, decoded.content_block);
        const id = String(decoded.index);
        switch (block.type) {
          case 'text':
            blocks.set(decoded.index, { type: 'text' });
            parts.push({ type: 'text-start', id });
            if (block.text !== '') {
              parts.push({ type: 'text-delta', id, delta: block.text });
            }
            break;
          case 'thinking':
            blocks.set(decoded.index, {
              type: 'reasoning',
              ...(block.signature === undefined ? undefined : { signature: block.signature }),
            });
            parts.push({ type: 'reasoning-start', id });
            if (block.thinking !== '') {
              parts.push({ type: 'reasoning-delta', id, delta: block.thinking });
            }
            break;
          case 'redacted_thinking':
            blocks.set(decoded.index, { type: 'reasoning', redactedData: block.data });
            parts.push({ type: 'reasoning-start', id });
            break;
          case 'tool_use': {
            // Input usually streams as deltas after an empty placeholder object.
            const seeded =
              typeof block.input === 'object' &&
              block.input !== null &&
              Object.keys(block.input).length > 0
                ? stringify(block.input)
                : '';
            blocks.set(decoded.index, {
              type: 'tool',
              id: block.id,
              name: block.name,
              input: seeded,
            });
            parts.push({ type: 'tool-params-start', id: block.id, name: block.name });
            if (seeded !== '') {
              parts.push({ type: 'tool-params-delta', id: block.id, delta: seeded });
            }
            break;
          }
        }
        break;
      }
      case 'content_block_delta': {
        const block = blocks.get(decoded.index);
        if (block === undefined || !isKnown(decoded.delta, Wire.deltaTypes)) {
          break;
        }
        const delta = yield* decodeDelta(method, decoded.delta);
        const id = String(decoded.index);
        if (delta.type === 'text_delta' && block.type === 'text') {
          parts.push({ type: 'text-delta', id, delta: delta.text });
        } else if (delta.type === 'thinking_delta' && block.type === 'reasoning') {
          parts.push({ type: 'reasoning-delta', id, delta: delta.thinking });
        } else if (delta.type === 'signature_delta' && block.type === 'reasoning') {
          block.signature = delta.signature;
        } else if (delta.type === 'input_json_delta' && block.type === 'tool') {
          if (delta.partial_json !== '') {
            block.input += delta.partial_json;
            parts.push({ type: 'tool-params-delta', id: block.id, delta: delta.partial_json });
          }
        } else {
          return yield* invalidResponse(
            method,
            `Delta ${delta.type} does not match content block ${decoded.index}`,
          );
        }
        break;
      }
      case 'content_block_stop':
        parts.push(...(yield* end(decoded.index)));
        break;
      case 'message_delta':
        mergeUsage(decoded.usage);
        stopReason = decoded.delta.stop_reason ?? stopReason;
        break;
      case 'message_stop':
        finished = true;
        for (const index of blocks.keys()) {
          parts.push(...(yield* end(index)));
        }
        parts.push({ type: 'finish', reason: finishReason(stopReason), usage: usage(counts) });
        break;
      case 'error':
        return yield* providerError(method, decoded.error);
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
          : Stream.fail(invalidResponse(method, 'Stream ended before message_stop')),
      ),
    ),
  );
};
