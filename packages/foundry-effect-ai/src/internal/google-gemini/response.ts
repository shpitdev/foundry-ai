// Adapted from @ai-sdk/google (Apache-2.0), 4.0.122.
/** A `generateContent` body → Effect AI response parts, plus helpers the stream shares. */
import * as AiError from 'effect/ai/AiError';
import * as IdGenerator from 'effect/ai/IdGenerator';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Response from 'effect/ai/Response';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { metadataKey } from './request.ts';
import type * as Wire from './schema.ts';

const module = 'GoogleLanguageModel';

export const invalidResponse = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidResponseError({ description }) });

const encodeJson = Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

/** JSON text for call arguments: a tool's streamed parameters, or the synthetic JSON answer. */
export const jsonText = (method: string, value: unknown): Effect.Effect<string, AiError.AiError> =>
  Effect.mapError(encodeJson(value), (error) => invalidResponse(method, error.message));

/**
 * A part's text: its own, or the arguments of a call to the synthetic JSON function, which is
 * the answer rather than a tool call.
 */
export const partText = (
  method: string,
  part: typeof Wire.ResponsePart.Type,
): Effect.Effect<string | undefined, AiError.AiError> =>
  part.functionCall === undefined
    ? Effect.succeed(part.text)
    : jsonText(method, part.functionCall.args ?? {});

/**
 * An error reported inside a successful response or stream. `RESOURCE_EXHAUSTED` is throttling;
 * anything else is a provider failure. Code and status stay in metadata.
 */
export const providerError = (
  method: string,
  error: typeof Wire.ErrorObject.Type,
): AiError.AiError => {
  const metadata = { [metadataKey]: { code: error.code ?? null, status: error.status ?? null } };
  const reason =
    error.status === 'RESOURCE_EXHAUSTED' || error.code === 429
      ? new AiError.RateLimitError({ metadata })
      : new AiError.InternalProviderError({
          description:
            [error.status ?? error.code, error.message].filter((text) => text != null).join(': ') ||
            'Response failed',
          metadata,
        });
  return AiError.make({ module, method, reason });
};

export const responseMetadata = (
  body: typeof Wire.Response.Type,
): Response.ResponseMetadataPartEncoded => ({
  type: 'response-metadata',
  id: body.responseId,
  modelId: body.modelVersion,
  timestamp: Option.getOrUndefined(
    Option.map(DateTime.make(body.createTime ?? ''), DateTime.formatIso),
  ),
});

/** The opaque signature Gemini needs back on the part that carried it. */
export const signed = (
  thoughtSignature: string | undefined,
): { metadata?: Record<string, { thoughtSignature: string }> } =>
  thoughtSignature === undefined ? {} : { metadata: { [metadataKey]: { thoughtSignature } } };

/** A prompt block reason other than the unspecified placeholder. */
export const blocked = (body: typeof Wire.Response.Type): boolean => {
  const reason = body.promptFeedback?.blockReason;
  return (
    reason !== undefined &&
    reason !== '' &&
    reason !== 'BLOCK_REASON_UNSPECIFIED' &&
    reason !== 'BLOCKED_REASON_UNSPECIFIED'
  );
};

const filtered = new Set([
  'SAFETY',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);

/** A blocked prompt is filtered; `CONTINUATION` is Gemini 4's per-request output cap. */
export const finishReason = (outcome: {
  readonly reason: string | undefined;
  readonly blocked: boolean;
  readonly hasToolCalls: boolean;
}): Response.FinishReason => {
  const { reason } = outcome;
  if (reason === undefined) {
    return outcome.blocked ? 'content-filter' : 'other';
  }
  if (reason === 'STOP') {
    return outcome.hasToolCalls ? 'tool-calls' : 'stop';
  }
  if (reason === 'MAX_TOKENS' || reason === 'CONTINUATION') {
    return 'length';
  }
  if (filtered.has(reason)) {
    return 'content-filter';
  }
  return reason === 'MALFORMED_FUNCTION_CALL' ? 'error' : 'other';
};

/** A snapshot with counts; Gemini sends `{}` on chunks before the last. */
export const hasUsage = (wire: typeof Wire.UsageMetadata.Type | undefined): boolean =>
  wire?.promptTokenCount !== undefined || wire?.totalTokenCount !== undefined;

/** Unreported usage stays undefined; inside a snapshot, proto3 omits zero counts. */
export const usage = (
  wire: typeof Wire.UsageMetadata.Type | undefined,
): typeof Response.Usage.Encoded => {
  if (wire === undefined || !hasUsage(wire)) {
    return { inputTokens: {}, outputTokens: {} };
  }
  const input = (wire.promptTokenCount ?? 0) + (wire.toolUsePromptTokenCount ?? 0);
  const cacheRead = wire.cachedContentTokenCount ?? 0;
  const text = wire.candidatesTokenCount ?? 0;
  const reasoning = wire.thoughtsTokenCount ?? 0;
  return {
    inputTokens: { total: input, uncached: input - cacheRead, cacheRead },
    outputTokens: { total: text + reasoning, text, reasoning },
  };
};

/**
 * A function call with its wire ID, or a generated one if Gemini sent none. Arguments arrive
 * as an object and are passed through; Toolkit validates them.
 */
export const toolCall = Effect.fnUntraced(function* (
  method: string,
  options: LanguageModel.ProviderOptions,
  functionCall: typeof Wire.FunctionCall.Type,
  thoughtSignature: string | undefined,
) {
  const { name } = functionCall;
  if (
    options.toolCallValidation !== 'deferred' &&
    !options.tools.some((tool) => tool.name === name)
  ) {
    return yield* AiError.make({
      module,
      method,
      reason: new AiError.ToolNotFoundError({
        toolName: name,
        availableTools: options.tools.map((tool) => String(tool.name)),
      }),
    });
  }
  const ids = yield* IdGenerator.IdGenerator;
  const call: Response.ToolCallPartEncoded = {
    type: 'tool-call',
    id: functionCall.id ?? (yield* ids.generateId()),
    name,
    params: functionCall.args ?? {},
    ...signed(thoughtSignature),
  };
  return call;
});

export const decodeResponse = Effect.fnUntraced(function* (
  body: typeof Wire.Response.Type,
  options: LanguageModel.ProviderOptions,
  jsonTool: string | undefined,
) {
  if (body.error !== undefined) {
    return yield* providerError('generateText', body.error);
  }
  const parts: Array<Response.PartEncoded> = [responseMetadata(body)];
  const candidate = body.candidates?.[0];
  let hasToolCalls = false;
  for (const part of candidate?.content?.parts ?? []) {
    if (part.functionCall !== undefined && part.functionCall.name !== jsonTool) {
      hasToolCalls = true;
      parts.push(
        yield* toolCall('generateText', options, part.functionCall, part.thoughtSignature),
      );
      continue;
    }
    const text = yield* partText('generateText', part);
    // A signature-only part stays a part of its own, so replay puts it back in place.
    if (text !== undefined && (text !== '' || part.thoughtSignature !== undefined)) {
      parts.push({
        type: part.thought === true ? 'reasoning' : 'text',
        text,
        ...signed(part.thoughtSignature),
      });
    }
  }
  parts.push({
    type: 'finish',
    reason: finishReason({ reason: candidate?.finishReason, blocked: blocked(body), hasToolCalls }),
    usage: usage(body.usageMetadata),
  });
  return parts;
});
