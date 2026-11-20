// Adapted from @effect/ai-anthropic (MIT), effect@4.1.4, 82904fe.
/**
 * Messages server-sent events → Effect AI stream parts. Blocks are tracked by `index`; a
 * thinking block's signature arrives as a delta and is attached to its end part. `message_stop`
 * closes any open blocks, emits the finish and stops reading. The last tool call is held until
 * the next block starts or the stop reason is known: one cut off by the output limit is dropped,
 * and the finish reports `length`. An in-band `error` fails the stream, and a stream that ends
 * before `message_stop` fails with `InvalidResponseError`.
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

interface ToolBlock {
  readonly type: 'tool';
  readonly id: string;
  readonly name: string;
  input: string;
}

type Block =
  | { readonly type: 'text' }
  | { readonly type: 'reasoning'; signature?: string; readonly redactedData?: string }
  | ToolBlock;

export const decodeStream = (
  events: Stream.Stream<Sse.Event, AiError.AiError>,
  options: LanguageModel.ProviderOptions,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
  let finished = false;
  let stopReason: string | null | undefined;
  // `message_delta` usage is cumulative: each reported count replaces the earlier one.
  const counts: Record<string, number> = {};
  const blocks = new Map<number, Block>();
  // Blocks of types this adapter skips; their deltas are skipped too.
  const skipped = new Set<number>();
  // The last finished tool call, which the output limit may have cut off.
  let held: ToolBlock | undefined;

  const mergeUsage = (wire: typeof Wire.Usage.Type | null | undefined) => {
    for (const [key, value] of Object.entries(wire ?? {})) {
      if (typeof value === 'number') {
        counts[key] = value;
      }
    }
  };

  const end = (index: number): Array<Response.StreamPartEncoded> => {
    const block = blocks.get(index);
    blocks.delete(index);
    const id = String(index);
    if (block === undefined) {
      return [];
    }
    if (block.type === 'text') {
      return [{ type: 'text-end', id }];
    }
    if (block.type === 'reasoning') {
      return [
        {
          type: 'reasoning-end',
          id,
          metadata: metadata({ signature: block.signature, redactedData: block.redactedData }),
        },
      ];
    }
    held = block;
    return [{ type: 'tool-params-end', id: block.id }];
  };

  /** Emits the held tool call, which is complete once another block starts or the turn ends. */
  const release = Effect.fnUntraced(function* () {
    const block = held;
    held = undefined;
    if (block === undefined) {
      return [];
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
    return [yield* toolCall(method, options, { id: block.id, name: block.name, input })];
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
        parts.push(...(yield* release()));
        if (!isKnown(decoded.content_block, Wire.contentBlockTypes)) {
          skipped.add(decoded.index);
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
        if (skipped.has(decoded.index) || !isKnown(decoded.delta, Wire.deltaTypes)) {
          break;
        }
        const delta = yield* decodeDelta(method, decoded.delta);
        const block = blocks.get(decoded.index);
        const id = String(decoded.index);
        if (block === undefined) {
          return yield* invalidResponse(method, `Delta ${delta.type} for unopened block ${id}`);
        }
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
        parts.push(...end(decoded.index));
        break;
      case 'message_delta':
        mergeUsage(decoded.usage);
        stopReason = decoded.delta.stop_reason ?? stopReason;
        break;
      case 'message_stop': {
        finished = true;
        for (const index of blocks.keys()) {
          parts.push(...end(index));
        }
        const reason = finishReason(stopReason);
        if (reason === 'length') {
          held = undefined;
        }
        parts.push(...(yield* release()), { type: 'finish', reason, usage: usage(counts) });
        break;
      }
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
