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
import { type Dialect, isStrict } from './request.ts';
import * as Wire from './schema.ts';

export const invalidResponse = (
  dialect: Dialect,
  method: string,
  description: string,
): AiError.AiError =>
  AiError.make({
    module: dialect.module,
    method,
    reason: new AiError.InvalidResponseError({ description }),
  });

type ErrorFields = typeof Wire.ErrorObject.Type;

const quotaCodes = new Set(['insufficient_quota', 'billing_insufficient_balance']);
const rateLimitCodes = new Set(['rate_limit_exceeded', 'rate_limit_error', 'requests', 'tokens']);

/**
 * A failure reported inside a successful HTTP response or stream. Quota and rate-limit codes
 * keep their own reasons; anything else is a provider failure. Code and type stay in metadata.
 */
export const providerError = (
  dialect: Dialect,
  method: string,
  error: ErrorFields,
): AiError.AiError => {
  const code = error.code == null ? undefined : String(error.code);
  const type = error.type == null ? undefined : String(error.type);
  const metadata = { [dialect.metadataKey]: { code: code ?? null, type: type ?? null } };
  const matches = (codes: ReadonlySet<string>) => codes.has(code ?? '') || codes.has(type ?? '');
  let reason: AiError.AiErrorReason;
  if (matches(quotaCodes)) {
    reason = new AiError.QuotaExhaustedError({ metadata });
  } else if (matches(rateLimitCodes)) {
    reason = new AiError.RateLimitError({ metadata });
  } else {
    const message = error.message == null ? undefined : String(error.message);
    reason = new AiError.InternalProviderError({
      description: [code ?? type, message].filter(Boolean).join(': ') || 'Response failed',
      metadata,
    });
  }
  return AiError.make({ module: dialect.module, method, reason });
};

export const timestamp = (createdAt: number): string =>
  DateTime.formatIso(DateTime.makeUnsafe(createdAt * 1000));

/** The item type of an output item, or undefined if it is not one this adapter reads. */
export const knownItem = (item: unknown): boolean =>
  Predicate.hasProperty(item, 'type') &&
  typeof item.type === 'string' &&
  Wire.outputItemTypes.has(item.type);

export const decodeItem = (dialect: Dialect, method: string, item: unknown) =>
  Effect.mapError(Schema.decodeUnknownEffect(Wire.OutputItem)(item), (error) =>
    AiError.make({
      module: dialect.module,
      method,
      reason: AiError.InvalidResponseError.fromSchemaError(error),
    }),
  );

/**
 * As the OpenAI peer decides it: a completed function call wins over a refusal, so tools still
 * run; an incomplete response without a known reason is `other`, never `stop`.
 */
export const finishReason = (outcome: {
  readonly status: string | null | undefined;
  readonly reason: string | null | undefined;
  readonly hasToolCalls: boolean;
  readonly hasRefusal: boolean;
}): Response.FinishReason => {
  if (outcome.reason === 'max_output_tokens') {
    return 'length';
  }
  if (outcome.reason === 'content_filter') {
    return 'content-filter';
  }
  if (outcome.hasToolCalls) {
    return 'tool-calls';
  }
  if (outcome.reason != null || outcome.status === 'incomplete') {
    return 'other';
  }
  return outcome.hasRefusal ? 'content-filter' : 'stop';
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
  dialect: Dialect,
  method: string,
  options: LanguageModel.ProviderOptions,
  name: string,
  args: string,
) {
  const params = yield* Effect.try({
    try: () => Tool.unsafeSecureJsonParse(args),
    catch: (cause) =>
      AiError.make({
        module: dialect.module,
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
      module: dialect.module,
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

/** Item IDs and reasoning ciphertext, kept for replay under the dialect's namespace. */
export const itemMetadata = (
  dialect: Dialect,
  fields: Readonly<Record<string, string | null | undefined>>,
): Record<string, Record<string, string>> => ({
  [dialect.metadataKey]: Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]): Array<[string, string]> =>
      value == null ? [] : [[key, value]],
    ),
  ),
});

/**
 * A completed function call. Its wire arguments stay in metadata: strict tools normalize the
 * parameters for Effect, and replay must send what the model produced, not that shape.
 */
export const toolCall = Effect.fnUntraced(function* (
  dialect: Dialect,
  method: string,
  options: LanguageModel.ProviderOptions,
  item: typeof Wire.FunctionCallItem.Type,
) {
  const part: Response.ToolCallPartEncoded = {
    type: 'tool-call',
    id: item.call_id,
    name: item.name,
    params: yield* toolParams(dialect, method, options, item.name, item.arguments),
    metadata: itemMetadata(dialect, { itemId: item.id, arguments: item.arguments }),
  };
  return part;
});

export const decodeResponse = Effect.fnUntraced(function* (
  dialect: Dialect,
  body: typeof Wire.Body.Type,
  options: LanguageModel.ProviderOptions,
) {
  if (!('output' in body)) {
    return yield* providerError(
      dialect,
      'generateText',
      typeof body.error === 'string' ? { ...body, message: body.error } : body.error,
    );
  }
  if (body.error != null || body.status === 'failed') {
    return yield* providerError(dialect, 'generateText', body.error ?? {});
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
  let hasRefusal = false;
  for (const raw of body.output) {
    if (!knownItem(raw)) {
      continue;
    }
    const item = yield* decodeItem(dialect, 'generateText', raw);
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
              metadata: itemMetadata(dialect, { itemId: item.id }),
            });
          } else if (content.type === 'refusal') {
            hasRefusal = true;
            parts.push({
              type: 'text',
              text: '',
              metadata: itemMetadata(dialect, { itemId: item.id, refusal: content.refusal }),
            });
          }
        }
        break;
      case 'reasoning': {
        // An empty summary still carries the item ID and encrypted content for replay.
        const metadata = itemMetadata(dialect, {
          itemId: item.id,
          encryptedContent: item.encrypted_content,
        });
        for (const summary of item.summary.length === 0 ? [{ text: '' }] : item.summary) {
          parts.push({ type: 'reasoning', text: summary.text, metadata });
        }
        break;
      }
      case 'function_call':
        // A call cut off by the output limit has partial arguments; the finish reports it.
        if (item.status === 'incomplete') {
          break;
        }
        hasToolCalls = true;
        parts.push(yield* toolCall(dialect, 'generateText', options, item));
        break;
    }
  }
  parts.push({
    type: 'finish',
    reason: finishReason({
      status: body.status,
      reason: body.incomplete_details?.reason,
      hasToolCalls,
      hasRefusal,
    }),
    usage: usage(body.usage),
  });
  return parts;
});
