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

/** HTTP status for each Google RPC status, for errors that carry no numeric code. */
const rpcStatuses: Readonly<Record<string, number>> = {
  INVALID_ARGUMENT: 400,
  FAILED_PRECONDITION: 400,
  OUT_OF_RANGE: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  ABORTED: 409,
  RESOURCE_EXHAUSTED: 429,
  CANCELLED: 499,
  UNKNOWN: 500,
  INTERNAL: 500,
  DATA_LOSS: 500,
  UNIMPLEMENTED: 501,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};

/**
 * An error reported inside a successful response or stream, classified by its numeric code or
 * RPC status as `FoundryClient` classifies HTTP statuses. Code and status stay in metadata.
 */
export const providerError = (
  method: string,
  error: typeof Wire.ErrorObject.Type,
): AiError.AiError => {
  const status = error.code ?? (error.status == null ? undefined : rpcStatuses[error.status]);
  const common = {
    description:
      [error.status ?? error.code, error.message].filter((text) => text != null).join(': ') ||
      'Response failed',
    metadata: { [metadataKey]: { code: error.code ?? null, status: error.status ?? null } },
  };
  let reason: AiError.AiErrorReason;
  if (status === 400 || status === 404 || status === 409) {
    reason = new AiError.InvalidRequestError(common);
  } else if (status === 401) {
    reason = new AiError.AuthenticationError({ kind: 'InvalidKey', ...common });
  } else if (status === 403) {
    reason = new AiError.AuthenticationError({ kind: 'InsufficientPermissions', ...common });
  } else if (status === 429) {
    reason = new AiError.RateLimitError({ metadata: common.metadata });
  } else if (status === undefined || status >= 500) {
    reason = new AiError.InternalProviderError(common);
  } else {
    reason = new AiError.UnknownError(common);
  }
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

/**
 * What replay needs under `metadataKey`: the part's thought signature, `localId` for a call ID
 * Gemini did not send, and `functionCall` for answer text that came from the synthetic JSON call.
 */
export const replayMetadata = (fields: {
  readonly thoughtSignature?: string | undefined;
  readonly localId?: boolean | undefined;
  readonly functionCall?: typeof Wire.FunctionCall.Type | undefined;
}): { metadata?: Response.ProviderMetadata } => {
  const replay: Record<string, Schema.Json> = {};
  if (fields.thoughtSignature !== undefined) {
    replay['thoughtSignature'] = fields.thoughtSignature;
  }
  if (fields.localId === true) {
    replay['localId'] = true;
  }
  const call = fields.functionCall;
  if (call !== undefined) {
    replay['functionCall'] = {
      name: call.name,
      args: call.args ?? {},
      ...(call.id === undefined ? undefined : { id: call.id }),
    };
  }
  return Object.keys(replay).length === 0 ? {} : { metadata: { [metadataKey]: replay } };
};

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
 * A function call with its wire ID, or a generated local one if Gemini sent none. Arguments
 * arrive as an object and are passed through; Toolkit validates them.
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
    ...replayMetadata({ thoughtSignature, localId: functionCall.id === undefined }),
  };
  return call;
});

/**
 * The text or reasoning a part carries, if any. A call to the synthetic JSON function is the
 * answer text, and in that mode other text is not. A signature-only fragment is empty text that
 * keeps its signature, with or without a `text` field.
 */
export const partContent = Effect.fnUntraced(function* (
  method: string,
  part: typeof Wire.ResponsePart.Type,
  jsonTool: string | undefined,
) {
  const call = part.functionCall;
  const skipped = call === undefined && jsonTool !== undefined && part.thought !== true;
  let text = part.text ?? '';
  if (call !== undefined) {
    text = yield* jsonText(method, call.args ?? {});
  }
  return skipped || (text === '' && part.thoughtSignature === undefined)
    ? undefined
    : {
        kind: part.thought === true ? ('reasoning' as const) : ('text' as const),
        text,
        ...replayMetadata({ thoughtSignature: part.thoughtSignature, functionCall: call }),
      };
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
    const content = yield* partContent('generateText', part, jsonTool);
    if (content !== undefined) {
      // A signature-only part stays a part of its own, so replay puts it back in place.
      const { kind, ...rest } = content;
      parts.push({ type: kind, ...rest });
    }
  }
  parts.push({
    type: 'finish',
    reason: finishReason({ reason: candidate?.finishReason, blocked: blocked(body), hasToolCalls }),
    usage: usage(body.usageMetadata),
  });
  return parts;
});
