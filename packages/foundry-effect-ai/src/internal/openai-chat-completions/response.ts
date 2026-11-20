// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/** A Chat Completions JSON body → Effect AI response parts, plus helpers the stream shares. */
import * as AiError from 'effect/ai/AiError';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import type * as Response from 'effect/ai/Response';
import * as Tool from 'effect/ai/Tool';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isStrict, metadataKey } from './request.ts';
import type * as Wire from './schema.ts';

const module = 'OpenAiChatLanguageModel';

export const invalidResponse = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidResponseError({ description }) });

const quotaCodes = new Set(['insufficient_quota', 'billing_insufficient_balance']);
const rateLimitCodes = new Set(['rate_limit_exceeded', 'rate_limit_error', 'requests', 'tokens']);

/**
 * A failure reported inside a successful HTTP response or stream. Quota and rate-limit codes
 * keep their own reasons; anything else is a provider failure. Code and type stay in metadata.
 */
export const providerError = (
  method: string,
  envelope: typeof Wire.ErrorEnvelope.Type,
): AiError.AiError => {
  const error =
    typeof envelope.error === 'string' ? { ...envelope, message: envelope.error } : envelope.error;
  const code = error.code == null ? undefined : String(error.code);
  const type = error.type == null ? undefined : String(error.type);
  const metadata = { [metadataKey]: { code: code ?? null, type: type ?? null } };
  const matches = (codes: ReadonlySet<string>) => codes.has(code ?? '') || codes.has(type ?? '');
  let reason: AiError.AiErrorReason;
  if (matches(quotaCodes)) {
    reason = new AiError.QuotaExhaustedError({ metadata });
  } else if (matches(rateLimitCodes)) {
    reason = new AiError.RateLimitError({ metadata });
  } else {
    const message = error.message == null ? undefined : String(error.message);
    reason = new AiError.InternalProviderError({
      description: [code ?? type, message].filter(Boolean).join(': ') || 'Completion failed',
      metadata,
    });
  }
  return AiError.make({ module, method, reason });
};

export const metadataPart = (chunk: {
  readonly id: string;
  readonly model: string;
  readonly created: number;
}): Response.ResponseMetadataPartEncoded => ({
  type: 'response-metadata',
  id: chunk.id,
  modelId: chunk.model,
  timestamp: DateTime.formatIso(DateTime.makeUnsafe(chunk.created * 1000)),
});

const reasons: ReadonlyMap<string, Response.FinishReason> = new Map([
  ['stop', 'stop'],
  ['length', 'length'],
  ['content_filter', 'content-filter'],
  ['tool_calls', 'tool-calls'],
  ['function_call', 'tool-calls'],
]);

/**
 * Length and content filters win; then any tool call, so tools still run; a refusal that stops
 * is `content-filter`. A reason this adapter does not know is `unknown`, never `stop`.
 */
export const finishReason = (
  raw: string | null | undefined,
  hasToolCalls: boolean,
  hasRefusal: boolean,
): Response.FinishReason => {
  const reason = raw == null ? undefined : reasons.get(raw);
  if (reason === 'length' || reason === 'content-filter') {
    return reason;
  }
  if (hasToolCalls) {
    return 'tool-calls';
  }
  if (reason === 'stop' && hasRefusal) {
    return 'content-filter';
  }
  return reason ?? 'unknown';
};

/** Output stopped by the length limit or a content filter may hold partial tool arguments. */
export const callsComplete = (raw: string | null | undefined): boolean =>
  raw !== 'length' && raw !== 'content_filter';

/** A refusal's explanation, which is not output text. */
export const finishMetadata = (refusal: string) =>
  refusal === '' ? undefined : { metadata: { [metadataKey]: { refusal } } };

const minus = (total: number | undefined, part: number | undefined) =>
  total === undefined || part === undefined ? undefined : total - part;

/** Totals as reported; unreported counts stay undefined rather than zero. */
export const usage = (
  wire: typeof Wire.Usage.Type | null | undefined,
): typeof Response.Usage.Encoded => {
  const input = wire?.prompt_tokens ?? undefined;
  const cacheRead = wire?.prompt_tokens_details?.cached_tokens ?? undefined;
  const output = wire?.completion_tokens ?? undefined;
  const reasoning = wire?.completion_tokens_details?.reasoning_tokens ?? undefined;
  return {
    inputTokens: {
      total: input,
      uncached: minus(input, cacheRead),
      cacheRead,
      cacheWrite: wire?.prompt_tokens_details?.cache_write_tokens ?? undefined,
    },
    outputTokens: { total: output, text: minus(output, reasoning), reasoning },
  };
};

/**
 * Parses function call arguments. Strict tools were sent the OpenAI codec's schema, so valid
 * arguments are decoded with it and re-encoded for the tool's own schema; Toolkit validates.
 */
const toolParams = Effect.fnUntraced(function* (
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

/**
 * A completed function call. Its wire arguments stay in metadata: strict tools normalize the
 * parameters for Effect, and replay must send what the model produced, not that shape.
 */
export const toolCall = Effect.fnUntraced(function* (
  method: string,
  options: LanguageModel.ProviderOptions,
  call: { readonly id: string; readonly name: string; readonly arguments: string },
) {
  const part: Response.ToolCallPartEncoded = {
    type: 'tool-call',
    id: call.id,
    name: call.name,
    params: yield* toolParams(method, options, call.name, call.arguments),
    metadata: { [metadataKey]: { arguments: call.arguments } },
  };
  return part;
});

export const decodeResponse = Effect.fnUntraced(function* (
  body: typeof Wire.Body.Type,
  options: LanguageModel.ProviderOptions,
) {
  if (!('choices' in body)) {
    return yield* providerError('generateText', body);
  }
  const parts: Array<Response.PartEncoded> = [metadataPart(body)];
  const [choice] = body.choices;
  const message = choice?.message;
  if (message?.content != null && message.content !== '') {
    parts.push({ type: 'text', text: message.content });
  }
  // Calls that may be cut off are dropped; the finish reports why.
  let hasToolCalls = false;
  if (callsComplete(choice?.finish_reason)) {
    for (const call of message?.tool_calls ?? []) {
      hasToolCalls = true;
      parts.push(
        yield* toolCall('generateText', options, {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        }),
      );
    }
  }
  const refusal = message?.refusal ?? '';
  parts.push({
    type: 'finish',
    reason: finishReason(choice?.finish_reason, hasToolCalls, refusal !== ''),
    usage: usage(body.usage),
    ...finishMetadata(refusal),
  });
  return parts;
});
