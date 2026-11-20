// Adapted from @effect/ai-anthropic (MIT), effect@4.1.4, 82904fe.
/** A Messages JSON body → Effect AI response parts, plus helpers the stream shares. */
import * as AiError from 'effect/ai/AiError';
import { toCodecAnthropic } from 'effect/ai/AnthropicStructuredOutput';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as Tool from 'effect/ai/Tool';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import { isStrict, jsonTool, metadataKey, stringify, type Target } from './request.ts';
import * as Wire from './schema.ts';

const module = 'AnthropicLanguageModel';
const isJson = Schema.is(Schema.Json);

export const invalidResponse = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidResponseError({ description }) });

/**
 * An Anthropic error envelope inside a successful HTTP response or stream. Rate limits, billing
 * and invalid requests keep their own reasons; anything else, such as `overloaded_error` or
 * `api_error`, is a provider failure. The error type stays in metadata.
 */
export const providerError = (
  method: string,
  error: typeof Wire.ErrorObject.Type,
): AiError.AiError => {
  const type = error.type ?? undefined;
  const description = [type, error.message].filter(Boolean).join(': ') || 'Response failed';
  const metadata = { [metadataKey]: { type: type ?? null } };
  let reason: AiError.AiErrorReason;
  if (type === 'rate_limit_error') {
    reason = new AiError.RateLimitError({ metadata });
  } else if (type === 'billing_error') {
    reason = new AiError.QuotaExhaustedError({ metadata });
  } else if (type === 'invalid_request_error') {
    reason = new AiError.InvalidRequestError({ description, metadata });
  } else {
    reason = new AiError.InternalProviderError({ description, metadata });
  }
  return AiError.make({ module, method, reason });
};

const finishReasons: Readonly<Record<string, Response.FinishReason>> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool-calls',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  pause_turn: 'pause',
  refusal: 'content-filter',
};

/** A structured-output tool call is the answer, not a tool call to run. */
export const finishReason = (
  stopReason: string | null | undefined,
  structured = false,
): Response.FinishReason => {
  const reason = stopReason == null ? undefined : finishReasons[stopReason];
  if (reason === undefined) {
    return 'unknown';
  }
  return structured && reason === 'tool-calls' ? 'stop' : reason;
};

/** Total input adds cache reads and writes to the uncached count; unreported counts stay undefined. */
export const usage = (
  wire: typeof Wire.Usage.Type | null | undefined,
): typeof Response.Usage.Encoded => {
  const uncached = wire?.input_tokens ?? undefined;
  const cacheRead = wire?.cache_read_input_tokens ?? undefined;
  const cacheWrite = wire?.cache_creation_input_tokens ?? undefined;
  return {
    inputTokens: {
      total: uncached === undefined ? undefined : uncached + (cacheRead ?? 0) + (cacheWrite ?? 0),
      uncached,
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: wire?.output_tokens ?? undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
};

const decodeSchema =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (method: string, value: unknown) =>
    Effect.mapError(Schema.decodeUnknownEffect(schema)(value), (error) =>
      AiError.make({ module, method, reason: AiError.InvalidResponseError.fromSchemaError(error) }),
    );

export const decodeBlock = decodeSchema(Wire.ContentBlock);
export const decodeDelta = decodeSchema(Wire.Delta);

/** Whether `value` has a string `type` in `known`, so it should be decoded rather than skipped. */
export const isKnown = (value: unknown, known: ReadonlySet<string>): boolean =>
  Predicate.hasProperty(value, 'type') && typeof value.type === 'string' && known.has(value.type);

/** Thinking signatures and redacted thinking, kept for replay under `metadataKey`. */
export const metadata = (
  fields: Readonly<Record<string, string | undefined>>,
): Record<string, Record<string, string>> => ({
  [metadataKey]: Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]): Array<[string, string]> =>
      value === undefined ? [] : [[key, value]],
    ),
  ),
});

/**
 * A completed tool call. Strict tools were sent the Anthropic codec's schema, so valid input is
 * decoded with it and re-encoded for the tool's own schema; Toolkit validates. The input the
 * model produced then stays in metadata, since replay must send it rather than that shape.
 */
export const toolCall = Effect.fnUntraced(function* (
  method: string,
  options: LanguageModel.ProviderOptions,
  call: { readonly id: string; readonly name: string; readonly input: unknown },
) {
  const tool = options.tools.find((candidate) => candidate.name === call.name);
  if (tool === undefined && options.toolCallValidation !== 'deferred') {
    return yield* AiError.make({
      module,
      method,
      reason: new AiError.ToolNotFoundError({
        toolName: call.name,
        availableTools: options.tools.map((candidate) => String(candidate.name)),
      }),
    });
  }
  let params = call.input;
  if (tool !== undefined && isStrict(tool) && !(Tool.isDynamic(tool) && tool.jsonSchema)) {
    type Codec = (input: unknown) => Effect.Effect<unknown, Schema.SchemaError>;
    const normalized = Effect.suspend(() => {
      // Tool parameter schemas need no services: Toolkit decodes them without any.
      /* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument */
      const decode = Schema.decodeUnknownEffect(
        toCodecAnthropic(tool.parametersSchema).codec,
      ) as Codec;
      const encode = Schema.encodeUnknownEffect(Schema.toCodecJson(tool.parametersSchema)) as Codec;
      /* oxlint-enable typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument */
      return Effect.flatMap(decode(call.input), encode);
    });
    params = yield* Effect.orElseSucceed(normalized, () => call.input);
  }
  const part: Response.ToolCallPartEncoded = {
    type: 'tool-call',
    id: call.id,
    name: call.name,
    params,
    ...(params === call.input || !isJson(call.input)
      ? undefined
      : { metadata: { [metadataKey]: { input: call.input } } }),
  };
  return part;
});

export const decodeResponse = Effect.fnUntraced(function* (
  body: typeof Wire.Body.Type,
  options: LanguageModel.ProviderOptions,
  target: Target,
) {
  if (!('content' in body)) {
    return yield* providerError('generateText', body.error);
  }
  const parts: Array<Response.PartEncoded> = [
    { type: 'response-metadata', id: body.id, modelId: body.model },
  ];
  const blocks: Array<typeof Wire.ContentBlock.Type> = [];
  for (const raw of body.content) {
    if (isKnown(raw, Wire.contentBlockTypes)) {
      blocks.push(yield* decodeBlock('generateText', raw));
    }
  }
  // The JSON tool's input is the answer; prose beside it would break JSON decoding.
  const json = jsonTool(options, target)?.objectName;
  const structured = blocks.some((block) => block.type === 'tool_use' && block.name === json);
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (!structured) {
          parts.push({ type: 'text', text: block.text });
        }
        break;
      case 'thinking':
        parts.push({
          type: 'reasoning',
          text: block.thinking,
          metadata: metadata({ signature: block.signature }),
        });
        break;
      case 'redacted_thinking':
        parts.push({
          type: 'reasoning',
          text: '',
          metadata: metadata({ redactedData: block.data }),
        });
        break;
      case 'tool_use':
        parts.push(
          block.name === json
            ? { type: 'text', text: stringify(block.input) }
            : yield* toolCall('generateText', options, block),
        );
        break;
    }
  }
  parts.push({
    type: 'finish',
    reason: finishReason(body.stop_reason, structured),
    usage: usage(body.usage),
  });
  return parts;
});
