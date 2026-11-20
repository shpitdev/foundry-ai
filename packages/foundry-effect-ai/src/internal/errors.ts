// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/**
 * Maps Foundry proxy failures to `AiError`. Foundry reports its own failures in a Conjure
 * envelope (`errorCode`, `errorName`, `errorInstanceId`, `parameters`) and nests a vendor's
 * rejection in `parameters.responseBody`. Vendor bodies are read leniently as
 * `error.{message,type,code,status}`, which covers OpenAI, Anthropic and Gemini. Descriptions
 * carry parsed messages, codes and redacted URLs; the raw body stays in `http.body`.
 */
import * as AiError from 'effect/ai/AiError';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Headers from 'effect/http/Headers';
import type * as HttpBody from 'effect/http/HttpBody';
import type * as HttpClientError from 'effect/http/HttpClientError';
import type * as HttpClientRequest from 'effect/http/HttpClientRequest';
import type * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as UrlParams from 'effect/http/UrlParams';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import type * as Schema from 'effect/Schema';

const module = 'FoundryClient';

const redactedHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

// Quota exhaustion arrives as 429 with one of these codes; plain throttling does not.
const quotaCodes = new Set(['insufficient_quota', 'billing_insufficient_balance']);

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/** `value[key]` as text when it is a string or number; each field is read on its own. */
const field = (value: unknown, key: string): string | undefined => {
  const raw = Predicate.isObject(value) ? value[key] : undefined;
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : undefined;
};

const readDetails = (body: string) => {
  const proxy = parseJson(body);
  const parameters = Predicate.isObject(proxy) ? proxy['parameters'] : undefined;
  // Foundry prints the vendor body as a Java Optional: `Optional[{...}]`.
  const nested = field(parameters, 'responseBody');
  const vendorBody =
    nested === undefined ? proxy : parseJson(nested.replace(/^Optional\[(.*)\]$/su, '$1'));
  const vendor = Predicate.isObject(vendorBody) ? vendorBody['error'] : undefined;
  return {
    message: field(vendor, 'message') ?? field(parameters, 'message'),
    code: field(vendor, 'code') ?? field(proxy, 'errorName'),
    type: field(vendor, 'type') ?? field(vendor, 'status'),
    errorName: field(proxy, 'errorName'),
    errorInstanceId: field(proxy, 'errorInstanceId'),
  };
};

const statusReason = (
  status: number,
  details: ReturnType<typeof readDetails>,
  common: {
    readonly description: string;
    readonly metadata: AiError.ProviderMetadata;
    readonly http: typeof AiError.HttpContext.Type;
  },
  retryAfter: string | undefined,
  now: number,
): AiError.AiErrorReason => {
  switch (status) {
    case 400:
    case 404:
    case 409:
    case 422:
      return new AiError.InvalidRequestError(common);
    case 401:
      return new AiError.AuthenticationError({ kind: 'InvalidKey', ...common });
    case 403:
      return new AiError.AuthenticationError({ kind: 'InsufficientPermissions', ...common });
    case 402:
      return new AiError.QuotaExhaustedError({ metadata: common.metadata, http: common.http });
    case 429: {
      if (quotaCodes.has(details.code ?? '') || quotaCodes.has(details.type ?? '')) {
        return new AiError.QuotaExhaustedError({ metadata: common.metadata, http: common.http });
      }
      const parsed = retryAfter === undefined ? undefined : Headers.parseRetryAfter(retryAfter);
      return new AiError.RateLimitError({
        retryAfter:
          parsed !== undefined && Result.isSuccess(parsed)
            ? Headers.retryAfterDelay(parsed.success, now)
            : undefined,
        metadata: common.metadata,
        http: common.http,
      });
    }
    default:
      return status >= 500
        ? new AiError.InternalProviderError(common)
        : new AiError.UnknownError(common);
  }
};

/** Fails with the `AiError` for a non-2xx proxy response. */
const fromResponse = Effect.fnUntraced(function* (
  method: string,
  response: HttpClientResponse.HttpClientResponse,
) {
  const body = yield* Effect.orElseSucceed(response.text, () => '');
  const now = yield* Clock.currentTimeMillis;
  const redactedNames = yield* UrlParams.CurrentRedactedNames;
  const details = readDetails(body);
  const reason = statusReason(
    response.status,
    details,
    {
      description: AiError.buildErrorDescription({
        status: response.status,
        message: details.message,
        method: response.request.method,
        url: UrlParams.redactUrl(response.request.url, redactedNames),
        errorCode: details.code,
        errorType: details.type,
        requestId: details.errorInstanceId,
        body: undefined,
      }),
      metadata: {
        foundry: {
          errorName: details.errorName ?? null,
          errorInstanceId: details.errorInstanceId ?? null,
          code: details.code ?? null,
          type: details.type ?? null,
        },
      },
      http: {
        response: {
          status: response.status,
          headers: Headers.redact(response.headers, redactedHeaders),
        },
        ...(body === '' ? undefined : { body }),
      },
    },
    response.headers['retry-after'],
    now,
  );
  return yield* AiError.make({ module, method, reason });
});

const networkError = Effect.fnUntraced(function* (
  method: string,
  reason: AiError.NetworkError['reason'],
  request: HttpClientRequest.HttpClientRequest,
  description: string | undefined,
  cause: unknown,
) {
  const redactedNames = yield* UrlParams.CurrentRedactedNames;
  return yield* AiError.make({
    module,
    method,
    reason: new AiError.NetworkError({
      reason,
      method: request.method,
      url: UrlParams.redactUrl(request.url, redactedNames),
      description,
      cause,
    }),
  });
});

/** Maps transport and status failures; a failed body read is a network failure. */
export const fromHttpClientError = (
  method: string,
  error: HttpClientError.HttpClientError,
): Effect.Effect<never, AiError.AiError> => {
  const { reason } = error;
  if (reason._tag === 'StatusCodeError') {
    return fromResponse(method, reason.response);
  }
  if (reason._tag === 'DecodeError' || reason._tag === 'EmptyBodyError') {
    return networkError(
      method,
      'TransportError',
      reason.request,
      'Failed to read the response body',
      error,
    );
  }
  return networkError(method, reason._tag, reason.request, reason.description, error);
};

/** The request body could not be encoded as JSON; retrying cannot help. */
export const fromBodyError = (
  method: string,
  request: HttpClientRequest.HttpClientRequest,
  error: HttpBody.HttpBodyError,
): Effect.Effect<never, AiError.AiError> =>
  networkError(method, 'EncodeError', request, 'Request body is not JSON-serializable', error);

export const invalidResponse = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidResponseError({ description }) });

/** A 2xx body that is not JSON or does not match the protocol schema. */
export const fromSchemaError = (method: string, error: Schema.SchemaError): AiError.AiError =>
  AiError.make({ module, method, reason: AiError.InvalidResponseError.fromSchemaError(error) });
