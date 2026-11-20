// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** A Responses JSON body → Effect AI response parts, plus helpers the stream shares. */
import * as AiError from 'effect/ai/AiError';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import type * as Response from 'effect/ai/Response';
import * as Tool from 'effect/ai/Tool';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import { isStrict, metadataKey } from './request.ts';
import * as Wire from './schema.ts';

const module = 'OpenAiLanguageModel';

export const invalidResponse = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidResponseError({ description }) });

/** A failure the provider reported inside a successful HTTP response or stream. */
export const providerError = (
  method: string,
  error: {
    readonly code?: string | null | undefined;
    readonly message?: string | null | undefined;
  },
): AiError.AiError =>
  AiError.make({
    module,
    method,
    reason: new AiError.InternalProviderError({
      description: [error.code, error.message].filter(Boolean).join(': ') || 'Response failed',
    }),
  });

export const timestamp = (createdAt: number): string =>
  DateTime.formatIso(DateTime.makeUnsafe(createdAt * 1000));

/** The item type of an output item, or undefined if it is not one this adapter reads. */
export const knownItem = (item: unknown): boolean =>
  Predicate.hasProperty(item, 'type') &&
  typeof item.type === 'string' &&
  Wire.outputItemTypes.has(item.type);

export const decodeItem = (method: string, item: unknown) =>
  Effect.mapError(Schema.decodeUnknownEffect(Wire.OutputItem)(item), (error) =>
    AiError.make({ module, method, reason: AiError.InvalidResponseError.fromSchemaError(error) }),
  );

const finishReasons: Readonly<Record<string, Response.FinishReason>> = {
  content_filter: 'content-filter',
  max_output_tokens: 'length',
};

export const finishReason = (
  reason: string | null | undefined,
  hasToolCalls: boolean,
): Response.FinishReason => {
  if (reason == null) {
    return hasToolCalls ? 'tool-calls' : 'stop';
  }
  return Object.hasOwn(finishReasons, reason) ? (finishReasons[reason] ?? 'unknown') : 'unknown';
};

const minus = (total: number | undefined, part: number | undefined) =>
  total === undefined || part === undefined ? undefined : total - part;

/** Unreported counts stay undefined rather than zero. */
export const usage = (
  wire: typeof Wire.Usage.Type | null | undefined,
): typeof Response.Usage.Encoded => {
  const input = wire?.input_tokens ?? undefined;
  const cacheRead = wire?.input_tokens_details?.cached_tokens ?? undefined;
  const output = wire?.output_tokens ?? undefined;
  const reasoning = wire?.output_tokens_details?.reasoning_tokens ?? undefined;
  return {
    inputTokens: {
      total: input,
      uncached: minus(input, cacheRead),
      cacheRead,
      cacheWrite: wire?.input_tokens_details?.cache_write_tokens ?? undefined,
    },
    outputTokens: { total: output, text: minus(output, reasoning), reasoning },
  };
};

/**
 * Parses function call arguments. Strict tools were sent the OpenAI codec's schema, so valid
 * arguments are decoded with it and re-encoded for the tool's own schema; Toolkit validates.
 */
export const toolParams = Effect.fnUntraced(function* (
  method: string,
  options: LanguageModel.ProviderOptions,
  name: string,
  args: string,
) {
  const params = yield* Effect.try({
    try: () => Tool.unsafeSecureJsonParse(args),
    catch: (cause) =>
      AiError.make({
        module,
        method,
        reason: new AiError.ToolParameterValidationError({
          toolName: name,
          description: `Tool arguments are not valid JSON: ${String(cause)}`,
        }),
      }),
  });
  const tool = options.tools.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    if (options.toolCallValidation === 'deferred') {
      return params;
    }
    return yield* AiError.make({
      module,
      method,
      reason: new AiError.ToolNotFoundError({
        toolName: name,
        availableTools: options.tools.map((candidate) => String(candidate.name)),
      }),
    });
  }
  if (!isStrict(tool) || (Tool.isDynamic(tool) && tool.jsonSchema !== undefined)) {
    return params;
  }
  type Codec = (input: unknown) => Effect.Effect<unknown, Schema.SchemaError>;
  const normalized = Effect.suspend(() => {
    // Tool parameter schemas need no services: Toolkit decodes them without any.
    /* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument */
    const decode = Schema.decodeUnknownEffect(toCodecOpenAI(tool.parametersSchema).codec) as Codec;
    const encode = Schema.encodeUnknownEffect(Schema.toCodecJson(tool.parametersSchema)) as Codec;
    /* oxlint-enable typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument */
    return Effect.flatMap(decode(params), encode);
  });
  return yield* Effect.orElseSucceed(normalized, () => params);
});

/** Item IDs and reasoning ciphertext, kept for replay under `metadataKey`. */
export const itemMetadata = (
  fields: Readonly<Record<string, string | null | undefined>>,
): Record<string, Record<string, string>> => ({
  [metadataKey]: Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]): Array<[string, string]> =>
      value == null ? [] : [[key, value]],
    ),
  ),
});

export const decodeResponse = Effect.fnUntraced(function* (
  body: typeof Wire.Response.Type,
  options: LanguageModel.ProviderOptions,
) {
  if (body.error != null) {
    return yield* providerError('generateText', body.error);
  }
  const parts: Array<Response.PartEncoded> = [
    {
      type: 'response-metadata',
      id: body.id,
      modelId: body.model,
      timestamp: timestamp(body.created_at),
    },
  ];
  let hasToolCalls = false;
  for (const raw of body.output) {
    if (!knownItem(raw)) {
      continue;
    }
    const item = yield* decodeItem('generateText', raw);
    switch (item.type) {
      case 'message':
        // Commentary would be joined with the answer and break JSON decoding.
        if (options.responseFormat.type === 'json' && item.phase === 'commentary') {
          break;
        }
        for (const content of item.content) {
          if (content.type === 'output_text') {
            parts.push({
              type: 'text',
              text: content.text ?? '',
              metadata: itemMetadata({ itemId: item.id }),
            });
          } else if (content.type === 'refusal') {
            parts.push({
              type: 'text',
              text: '',
              metadata: itemMetadata({ itemId: item.id, refusal: content.refusal }),
            });
          }
        }
        break;
      case 'reasoning': {
        // An empty summary still carries the item ID and encrypted content for replay.
        const metadata = itemMetadata({
          itemId: item.id,
          encryptedContent: item.encrypted_content,
        });
        for (const summary of item.summary.length === 0 ? [{ text: '' }] : item.summary) {
          parts.push({ type: 'reasoning', text: summary.text, metadata });
        }
        break;
      }
      case 'function_call':
        hasToolCalls = true;
        parts.push({
          type: 'tool-call',
          id: item.call_id,
          name: item.name,
          params: yield* toolParams('generateText', options, item.name, item.arguments),
          metadata: itemMetadata({ itemId: item.id }),
        });
        break;
    }
  }
  parts.push({
    type: 'finish',
    reason: finishReason(body.incomplete_details?.reason, hasToolCalls),
    usage: usage(body.usage),
  });
  return parts;
});
